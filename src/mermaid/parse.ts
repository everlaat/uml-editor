import {
  emptyDiagram,
  makeEdge,
  makeNode,
  type ArrowHead,
  type Diagram,
  type DiagramNode,
  type Direction,
  type EdgeLine,
  type NodeShape,
} from '../core/model';
import { fitNodeSize } from '../render/shapes';

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  diagram: Diagram | null;
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

const DIRECTIONS: Record<string, Direction> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
  DT: 'BT',
};

/**
 * Bracket pairs, longest prefix first so `[[` wins over `[`. The canonical
 * shape for each pair is whichever built-in declares it, which keeps the
 * parser and the serializer in step automatically.
 */
const SHAPE_PAIRS: { open: string; close: string; shape: NodeShape }[] = [
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogram-alt' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '[\\', close: '/]', shape: 'trapezoid-alt' },
  { open: '>', close: ']', shape: 'rect' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
];

const LINK_RE = /(<?)(-\.-+|-{2,}|={2,})(>|x|o|)(?:\|([^|]*)\|)?/;

/**
 * Which shape a bracket pair reads back as. A shape whose own pair maps to a
 * different shape survives export but not re-import, which the fidelity
 * report calls an approximation.
 */
export function canonicalShapeFor(open: string, close: string): NodeShape | undefined {
  return SHAPE_PAIRS.find((p) => p.open === open && p.close === close)?.shape;
}

export function parseMermaid(text: string, name?: string): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const statements = splitStatements(text);
  const header = statements.find((s) => s.text.length > 0);
  if (!header) return { diagram: null, errors: [{ line: 1, message: 'Nothing to parse.' }], warnings };

  const kind = detectKind(header.text);
  if (!kind) {
    return {
      diagram: null,
      errors: [
        {
          line: header.line,
          message: `Unsupported diagram type "${header.text.split(/\s+/)[0]}". Supported: flowchart, graph, classDiagram.`,
        },
      ],
      warnings,
    };
  }

  const diagram = emptyDiagram(name ?? (kind === 'class' ? 'Class diagram' : 'Flowchart'));
  diagram.kind = kind;
  if (kind === 'class') parseClassDiagram(statements, diagram, errors, warnings);
  else parseFlowchart(statements, diagram, errors, warnings);

  if (!diagram.nodes.length && !errors.length) {
    errors.push({ line: header.line, message: 'No nodes found.' });
  }
  for (const n of diagram.nodes) {
    const size = fitNodeSize(n);
    n.w = size.w;
    n.h = size.h;
  }
  return { diagram: errors.length ? null : diagram, errors, warnings };
}

function detectKind(header: string): Diagram['kind'] | null {
  const word = header.trim().split(/[\s-]+/)[0]?.toLowerCase();
  if (word === 'flowchart' || word === 'graph') return 'flowchart';
  if (word === 'classdiagram' || word === 'classdiagram-v2') return 'class';
  return null;
}

interface Statement {
  text: string;
  line: number;
}

/** Strips comments, splits on newlines and `;`, keeping original line numbers. */
function splitStatements(text: string): Statement[] {
  const out: Statement[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const stripped = stripComment(raw);
    for (const part of splitOutsideQuotes(stripped, ';')) {
      const t = part.trim();
      if (t) out.push({ text: t, line: i + 1 });
    }
  });
  return out;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '%' && line[i + 1] === '%') return line.slice(0, i);
  }
  return line;
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let quote: string | null = null;
  let depth = 0;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

// ---------------------------------------------------------------- flowchart

function parseFlowchart(statements: Statement[], diagram: Diagram, errors: ParseIssue[], warnings: ParseIssue[]): void {
  const byId = new Map<string, DiagramNode>();
  const classFills = new Map<string, string>();
  const groupStack: string[] = [];
  let seenHeader = false;

  const ensureNode = (spec: NodeSpec): DiagramNode => {
    let node = byId.get(spec.id);
    if (!node) {
      node = makeNode({ id: spec.id, label: spec.label ?? spec.id, shape: spec.shape ?? 'rect', x: 0, y: 0 });
      byId.set(spec.id, node);
      diagram.nodes.push(node);
    } else {
      if (spec.label !== undefined) node.label = spec.label;
      if (spec.shape) node.shape = spec.shape;
    }
    if (spec.className) {
      const fill = classFills.get(spec.className);
      if (fill) node.color = fill;
      else node.color = node.color ?? undefined;
    }
    if (groupStack.length) node.parent = groupStack[groupStack.length - 1];
    return node;
  };

  for (const st of statements) {
    const text = st.text;
    if (!seenHeader && detectKind(text)) {
      seenHeader = true;
      const dir = text.trim().split(/\s+/)[1];
      if (dir && DIRECTIONS[dir.toUpperCase()]) diagram.direction = DIRECTIONS[dir.toUpperCase()];
      continue;
    }

    if (/^end$/i.test(text)) {
      if (!groupStack.length) warnings.push({ line: st.line, message: '`end` without a matching `subgraph`.' });
      else groupStack.pop();
      continue;
    }

    const sub = /^subgraph\s+(.*)$/i.exec(text);
    if (sub) {
      const spec = parseNodeSpec(sub[1].trim());
      const id = spec?.id ?? `sub${diagram.groups.length + 1}`;
      const label = spec?.label ?? spec?.id ?? sub[1].trim();
      diagram.groups.push({ id, label: stripQuotes(label), x: 0, y: 0, w: 0, h: 0 });
      groupStack.push(id);
      continue;
    }

    if (/^direction\s+/i.test(text)) continue;

    const classDef = /^classDef\s+(\S+)\s+(.*)$/i.exec(text);
    if (classDef) {
      const fill = /fill\s*:\s*([^,;]+)/i.exec(classDef[2])?.[1]?.trim();
      if (fill) for (const nm of classDef[1].split(',')) classFills.set(nm.trim(), fill);
      continue;
    }

    const styleStmt = /^style\s+(\S+)\s+(.*)$/i.exec(text);
    if (styleStmt) {
      const fill = /fill\s*:\s*([^,;]+)/i.exec(styleStmt[2])?.[1]?.trim();
      const node = byId.get(styleStmt[1]);
      if (fill && node) node.color = fill;
      continue;
    }

    const classApply = /^class\s+(\S+)\s+(\S+)$/i.exec(text);
    if (classApply) {
      const fill = classFills.get(classApply[2]);
      if (fill) for (const id of classApply[1].split(',')) {
        const node = byId.get(id.trim());
        if (node) node.color = fill;
      }
      continue;
    }

    if (/^(click|linkStyle|accTitle|accDescr)\b/i.test(text)) continue;

    // Chain of nodes joined by links: A --> B -- yes --> C & D
    const chain = parseChain(normalizeLinkLabels(text), st.line, errors);
    if (!chain) continue;
    if (chain.links.length === 0) {
      for (const spec of chain.groups[0] ?? []) ensureNode(spec);
      continue;
    }
    for (let i = 0; i < chain.links.length; i++) {
      const link = chain.links[i];
      const fromGroup = chain.groups[i] ?? [];
      const toGroup = chain.groups[i + 1] ?? [];
      for (const fromSpec of fromGroup) {
        for (const toSpec of toGroup) {
          const a = ensureNode(fromSpec);
          const b = ensureNode(toSpec);
          diagram.edges.push(
            makeEdge(a.id, b.id, {
              label: link.label,
              line: link.line,
              startArrow: link.startArrow,
              endArrow: link.endArrow,
            }),
          );
        }
      }
    }
  }

  if (groupStack.length) warnings.push({ line: statements[statements.length - 1].line, message: 'Unclosed `subgraph`.' });
}

/** Rewrites mid-text link labels (`-- yes -->`) into pipe form (`-->|yes|`). */
export function normalizeLinkLabels(s: string): string {
  let out = s;
  out = out.replace(/={2,}\s*([^=|\n]+?)\s*={2,}(>|)/g, (_m, label: string, head: string) =>
    `${head ? '==>' : '==='}|${label.trim()}|`,
  );
  out = out.replace(/-\.\s*([^.|\n]+?)\s*\.-(>|)/g, (_m, label: string, head: string) =>
    `${head ? '-.->' : '-.-'}|${label.trim()}|`,
  );
  out = out.replace(/-{2,}\s*([^->|\n][^-|\n]*?)\s*-{2,}(>|x|o|)/g, (_m, label: string, head: string) => {
    const arrow = head === '>' ? '-->' : head === 'x' ? '--x' : head === 'o' ? '--o' : '---';
    return `${arrow}|${label.trim()}|`;
  });
  return out;
}

interface LinkSpec {
  line: EdgeLine;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  label?: string;
}

interface NodeSpec {
  id: string;
  label?: string;
  shape?: NodeShape;
  className?: string;
}

function parseChain(
  text: string,
  lineNo: number,
  errors: ParseIssue[],
): { groups: NodeSpec[][]; links: LinkSpec[] } | null {
  const groups: NodeSpec[][] = [];
  const links: LinkSpec[] = [];
  let rest = text;
  let guard = 0;
  while (guard++ < 200) {
    const m = LINK_RE.exec(rest);
    if (!m) break;
    const head = rest.slice(0, m.index).trim();
    const specs = parseNodeGroup(head, lineNo, errors);
    if (!specs) return null;
    groups.push(specs);
    links.push(toLinkSpec(m));
    rest = rest.slice(m.index + m[0].length);
  }
  const tail = parseNodeGroup(rest.trim(), lineNo, errors);
  if (!tail) return null;
  groups.push(tail);
  if (links.length && groups.some((g) => g.length === 0)) {
    errors.push({ line: lineNo, message: 'A link is missing a node on one side.' });
    return null;
  }
  return { groups, links };
}

function toLinkSpec(m: RegExpExecArray): LinkSpec {
  const [, lead, body, head, label] = m;
  const line: EdgeLine = body.startsWith('=') ? 'thick' : body.includes('.') ? 'dashed' : 'solid';
  const endArrow: ArrowHead = head === '>' ? 'arrow' : head === 'x' ? 'cross' : head === 'o' ? 'circle' : 'none';
  const startArrow: ArrowHead = lead === '<' ? 'arrow' : 'none';
  return { line, startArrow, endArrow, label: label?.trim() ? stripQuotes(label.trim()) : undefined };
}

function parseNodeGroup(text: string, lineNo: number, errors: ParseIssue[]): NodeSpec[] | null {
  if (!text) return [];
  const specs: NodeSpec[] = [];
  for (const part of splitOutsideQuotes(text, '&')) {
    const t = part.trim();
    if (!t) continue;
    const spec = parseNodeSpec(t);
    if (!spec) {
      errors.push({ line: lineNo, message: `Could not read node "${t}".` });
      return null;
    }
    specs.push(spec);
  }
  return specs;
}

export function parseNodeSpec(text: string): NodeSpec | null {
  let body = text.trim();
  if (!body) return null;
  let className: string | undefined;
  const cls = /:::([A-Za-z0-9_-]+)\s*$/.exec(body);
  if (cls) {
    className = cls[1];
    body = body.slice(0, cls.index).trim();
  }
  const bracketIdx = body.search(/[[({>]/);
  if (bracketIdx === -1) {
    if (!/^[A-Za-z0-9_\-.:#]+$/.test(body)) return null;
    return { id: body, className };
  }
  const id = body.slice(0, bracketIdx).trim();
  if (!id || !/^[A-Za-z0-9_\-.:#]+$/.test(id)) return null;
  const remainder = body.slice(bracketIdx);
  for (const pair of SHAPE_PAIRS) {
    if (remainder.startsWith(pair.open) && remainder.endsWith(pair.close) && remainder.length >= pair.open.length + pair.close.length) {
      const inner = remainder.slice(pair.open.length, remainder.length - pair.close.length);
      return { id, label: decodeLabel(inner), shape: pair.shape, className };
    }
  }
  return { id, label: decodeLabel(remainder.replace(/^[[({>]+/, '').replace(/[\])}]+$/, '')), className };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

export function decodeLabel(raw: string): string {
  return stripQuotes(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/#35;/g, '#')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// -------------------------------------------------------------- classDiagram

/** Mermaid class relations, longest token first. */
const CLASS_RELATIONS: { token: string; startArrow: ArrowHead; endArrow: ArrowHead; line: EdgeLine }[] = [
  { token: '<|..|>', startArrow: 'triangle', endArrow: 'triangle', line: 'dashed' },
  { token: '<|--|>', startArrow: 'triangle', endArrow: 'triangle', line: 'solid' },
  { token: '<|..', startArrow: 'triangle', endArrow: 'none', line: 'dashed' },
  { token: '..|>', startArrow: 'none', endArrow: 'triangle', line: 'dashed' },
  { token: '<|--', startArrow: 'triangle', endArrow: 'none', line: 'solid' },
  { token: '--|>', startArrow: 'none', endArrow: 'triangle', line: 'solid' },
  { token: '*--', startArrow: 'diamond', endArrow: 'none', line: 'solid' },
  { token: '--*', startArrow: 'none', endArrow: 'diamond', line: 'solid' },
  { token: 'o--', startArrow: 'odiamond', endArrow: 'none', line: 'solid' },
  { token: '--o', startArrow: 'none', endArrow: 'odiamond', line: 'solid' },
  { token: '<-->', startArrow: 'open', endArrow: 'open', line: 'solid' },
  { token: '<--', startArrow: 'open', endArrow: 'none', line: 'solid' },
  { token: '-->', startArrow: 'none', endArrow: 'open', line: 'solid' },
  { token: '<..', startArrow: 'open', endArrow: 'none', line: 'dashed' },
  { token: '..>', startArrow: 'none', endArrow: 'open', line: 'dashed' },
  { token: '--', startArrow: 'none', endArrow: 'none', line: 'solid' },
  { token: '..', startArrow: 'none', endArrow: 'none', line: 'dashed' },
];

function parseClassDiagram(
  statements: Statement[],
  diagram: Diagram,
  errors: ParseIssue[],
  warnings: ParseIssue[],
): void {
  const byId = new Map<string, DiagramNode>();
  const ensure = (id: string, label?: string): DiagramNode => {
    let node = byId.get(id);
    if (!node) {
      node = makeNode({ id, label: label ?? id, shape: 'class', x: 0, y: 0, attributes: [], methods: [] });
      byId.set(id, node);
      diagram.nodes.push(node);
    } else if (label) node.label = label;
    return node;
  };

  let openClass: DiagramNode | null = null;
  let seenHeader = false;

  for (const st of statements) {
    const text = st.text;
    if (!seenHeader && detectKind(text) === 'class') {
      seenHeader = true;
      continue;
    }
    if (/^direction\s+/i.test(text)) {
      const dir = text.split(/\s+/)[1]?.toUpperCase();
      if (dir && DIRECTIONS[dir]) diagram.direction = DIRECTIONS[dir];
      continue;
    }
    if (openClass) {
      if (text === '}') {
        openClass = null;
        continue;
      }
      addMember(openClass, text);
      continue;
    }
    if (/^(note|click|style|classDef|cssClass|namespace)\b/i.test(text)) continue;

    const classDecl = /^class\s+([A-Za-z0-9_~<>.-]+)\s*(?:\[\s*"([^"]*)"\s*\])?\s*(\{)?\s*$/i.exec(text);
    if (classDecl) {
      const node = ensure(normalizeClassName(classDecl[1]), classDecl[2] ?? normalizeClassName(classDecl[1]));
      if (classDecl[3]) openClass = node;
      continue;
    }

    const stereotypeOnly = /^<<\s*([^>]+)\s*>>\s*([A-Za-z0-9_.-]+)$/.exec(text);
    if (stereotypeOnly) {
      ensure(stereotypeOnly[2]).stereotype = stereotypeOnly[1].trim();
      continue;
    }

    const member = /^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/.exec(text);
    const relation = findRelation(text);
    if (relation) {
      const { left, right, token } = relation;
      const def = CLASS_RELATIONS.find((r) => r.token === token)!;
      const [leftName, leftCard] = splitCardinality(left);
      const [rightPart, rightCard] = splitCardinality(right);
      const [rightName, label] = splitRelationLabel(rightPart);
      if (!leftName || !rightName) {
        errors.push({ line: st.line, message: `Could not read relation "${text}".` });
        continue;
      }
      const a = ensure(normalizeClassName(leftName));
      const b = ensure(normalizeClassName(rightName));
      const parts = [leftCard, label, rightCard].filter(Boolean);
      diagram.edges.push(
        makeEdge(a.id, b.id, {
          label: parts.length ? parts.join(' ') : undefined,
          line: def.line,
          startArrow: def.startArrow,
          endArrow: def.endArrow,
        }),
      );
      continue;
    }
    if (member) {
      addMember(ensure(normalizeClassName(member[1])), member[2]);
      continue;
    }
    warnings.push({ line: st.line, message: `Ignored line: "${text}".` });
  }
}

function findRelation(text: string): { left: string; right: string; token: string } | null {
  for (const rel of CLASS_RELATIONS) {
    const idx = text.indexOf(rel.token);
    if (idx > 0) {
      // Avoid matching `--` inside a longer token we already tried (ordering handles most).
      return { left: text.slice(0, idx).trim(), right: text.slice(idx + rel.token.length).trim(), token: rel.token };
    }
  }
  return null;
}

function splitCardinality(part: string): [string, string] {
  const m = /^(?:"([^"]*)"\s*)?(.*?)(?:\s*"([^"]*)")?$/.exec(part.trim());
  if (!m) return [part.trim(), ''];
  const card = m[1] ?? m[3] ?? '';
  return [m[2].trim(), card ? `"${card}"` : ''];
}

function splitRelationLabel(part: string): [string, string] {
  const idx = part.indexOf(':');
  if (idx === -1) return [part.trim(), ''];
  return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()];
}

function normalizeClassName(name: string): string {
  return name.replace(/~.*~/g, '').trim();
}

function addMember(node: DiagramNode, raw: string): void {
  const text = raw.trim().replace(/[;,]$/, '');
  if (!text) return;
  const stereo = /^<<\s*([^>]+)\s*>>$/.exec(text);
  if (stereo) {
    node.stereotype = stereo[1].trim();
    return;
  }
  node.attributes ??= [];
  node.methods ??= [];
  if (text.includes('(')) node.methods.push(text);
  else node.attributes.push(text);
}
