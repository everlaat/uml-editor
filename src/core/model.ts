/** Core document model. Everything the editor can draw lives in a `Diagram`. */

/**
 * A shape id. Open rather than a union so user-defined shapes are ordinary
 * citizens; `src/shapes/registry.ts` is the source of truth for what exists.
 */
export type NodeShape = string;

export type TextFont = 'sans' | 'serif' | 'mono' | 'hand';
export type TextAlign = 'left' | 'center' | 'right';
export type TextVAlign = 'top' | 'middle' | 'bottom';

/**
 * Type settings for any label: a node's text, an edge's text, or a standalone
 * piece of text on the canvas. Everything is optional — an unset field falls
 * back to the shape's default, then to the theme.
 */
export interface TextStyle {
  font?: TextFont;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Palette token or CSS colour; unset means "read from the shape". */
  color?: string;
  align?: TextAlign;
  valign?: TextVAlign;
  lineHeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

export type EdgeLine = 'solid' | 'dashed' | 'thick';

/** Arrow head vocabulary, chosen to cover both flowcharts and UML relations. */
export type ArrowHead =
  | 'none'
  | 'arrow' // filled triangle-ish (flowchart default)
  | 'open' // open "V"
  | 'triangle' // hollow triangle (UML generalization / realization)
  | 'diamond' // filled diamond (UML composition)
  | 'odiamond' // hollow diamond (UML aggregation)
  | 'circle'
  | 'cross';

export type RouteStyle = 'orthogonal' | 'straight' | 'curved';

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export interface DiagramNode {
  id: string;
  label: string;
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Palette token name (see theme.ts) or an explicit hex colour. */
  color?: string;
  /** UML class compartments. */
  attributes?: string[];
  methods?: string[];
  stereotype?: string;
  /** Optional parent group id (subgraph / package). */
  parent?: string;
  /** Type settings for this node's label. */
  text?: TextStyle;
  /**
   * For user-defined shapes: the outline in a unit box, carried on the node so
   * a shared document still draws correctly without the author's shape library.
   */
  customPath?: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  line: EdgeLine;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  route?: RouteStyle;
  color?: string;
  /** Type settings for this edge's label. */
  text?: TextStyle;
  /**
   * Interior points the edge must pass through, produced by auto-layout for
   * edges that span more than one rank so they travel down their own lane
   * instead of crossing the shapes in between.
   */
  waypoints?: { x: number; y: number }[];
  /**
   * Endpoint positions the waypoints were computed for, as
   * [fromX, fromY, toX, toY]. If either end has moved since, the waypoints are
   * stale and renderers fall back to a direct route.
   */
  waypointAnchor?: [number, number, number, number];
}

export interface DiagramGroup {
  id: string;
  label: string;
  /** Groups are laid out around their members; geometry is derived but cached. */
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

export type DiagramKind = 'flowchart' | 'class';

export interface Diagram {
  id: string;
  name: string;
  kind: DiagramKind;
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  createdAt: number;
  updatedAt: number;
  /** Persisted viewport so re-opening a diagram feels like you never left. */
  view?: { x: number; y: number; zoom: number };
}

export const SCHEMA_VERSION = 1;

let counter = 0;
/** Short, stable, URL-safe id. Monotonic suffix keeps ids unique within a tick. */
export function uid(prefix = 'n'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}${Date.now().toString(36).slice(-4)}${rand}${counter.toString(36)}`;
}

export function emptyDiagram(name = 'Untitled diagram'): Diagram {
  const now = Date.now();
  return {
    id: uid('d'),
    name,
    kind: 'flowchart',
    direction: 'TB',
    nodes: [],
    edges: [],
    groups: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function nodeById(d: Diagram, id: string): DiagramNode | undefined {
  return d.nodes.find((n) => n.id === id);
}

export function makeNode(
  partial: Partial<DiagramNode> & { x: number; y: number },
  defaultSize: { w: number; h: number } = { w: 150, h: 60 },
): DiagramNode {
  const shape = partial.shape ?? 'rect';
  const size = defaultSize;
  return {
    id: partial.id ?? uid(),
    label: partial.label ?? '',
    shape,
    x: Math.round(partial.x),
    y: Math.round(partial.y),
    w: partial.w ?? size.w,
    h: partial.h ?? size.h,
    color: partial.color,
    attributes: partial.attributes,
    methods: partial.methods,
    stereotype: partial.stereotype,
    parent: partial.parent,
    text: partial.text ? { ...partial.text } : undefined,
    customPath: partial.customPath,
  };
}

export function makeEdge(from: string, to: string, partial: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: partial.id ?? uid('e'),
    from,
    to,
    label: partial.label,
    text: partial.text ? { ...partial.text } : undefined,
    line: partial.line ?? 'solid',
    startArrow: partial.startArrow ?? 'none',
    endArrow: partial.endArrow ?? 'arrow',
    route: partial.route,
    color: partial.color,
    waypoints: partial.waypoints?.map((p) => ({ x: p.x, y: p.y })),
    waypointAnchor: partial.waypointAnchor,
  };
}

/** Defensive clone + fill-in for documents coming from storage, files or the LLM. */
export function normalizeDiagram(input: unknown, fallbackName = 'Imported diagram'): Diagram {
  const raw = (input ?? {}) as Partial<Diagram>;
  const base = emptyDiagram(typeof raw.name === 'string' && raw.name ? raw.name : fallbackName);
  const nodes: DiagramNode[] = Array.isArray(raw.nodes)
    ? raw.nodes
        .filter((n): n is DiagramNode => !!n && typeof n === 'object')
        .map((n) =>
          makeNode({
            ...n,
            x: Number.isFinite(n.x) ? n.x : 0,
            y: Number.isFinite(n.y) ? n.y : 0,
            // An unknown shape id is kept, not rewritten: the shape may come
            // from a library this browser has not loaded yet.
            shape: typeof n.shape === 'string' && n.shape ? n.shape : 'rect',
          }),
        )
    : [];
  const ids = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = Array.isArray(raw.edges)
    ? raw.edges
        .filter((e): e is DiagramEdge => !!e && typeof e === 'object' && ids.has(e.from) && ids.has(e.to))
        .map((e) => makeEdge(e.from, e.to, e))
    : [];
  return {
    ...base,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    kind: raw.kind === 'class' ? 'class' : 'flowchart',
    direction: (['TB', 'BT', 'LR', 'RL'] as Direction[]).includes(raw.direction as Direction)
      ? (raw.direction as Direction)
      : 'TB',
    nodes,
    edges,
    groups: Array.isArray(raw.groups) ? raw.groups.filter((g) => !!g && typeof g === 'object') : [],
    createdAt: Number.isFinite(raw.createdAt) ? (raw.createdAt as number) : base.createdAt,
    updatedAt: Date.now(),
    view: raw.view && Number.isFinite(raw.view.zoom) ? raw.view : undefined,
  };
}
