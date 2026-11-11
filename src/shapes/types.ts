import type { DiagramNode, TextStyle } from '../core/model';

export interface Size {
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a shape is asked to draw: its own size, plus the node for extras. */
export interface ShapeContext extends Size {
  node: DiagramNode;
}

export interface ShapeGeometry {
  /** Outline path in local coordinates (0,0 is the node's top-left). */
  path: string;
  /** Extra strokes drawn over the outline (compartment rules, folds, …). */
  decorations?: string[];
  /** Where the label goes. */
  textBox: Box;
  /** Draw the outline with no fill (stick figures, bare text). */
  noFill?: boolean;
  /** Skip the outline stroke entirely. */
  noStroke?: boolean;
}

export type ShapeCategory = 'flow' | 'uml' | 'annotation' | 'custom';

/** How a shape is written in Mermaid, or `null` when it cannot be. */
export interface MermaidMapping {
  open: string;
  close: string;
}

/**
 * Everything the editor needs to know about one kind of element. Adding an
 * element means adding one of these and nothing else: the palette, inspector,
 * auto-sizing, Mermaid mapping and fidelity report all read from here.
 */
export interface ShapeDefinition {
  id: string;
  name: string;
  category: ShapeCategory;
  /** Longer description, shown as the palette tooltip. */
  hint?: string;
  defaultSize: Size;
  minSize?: Size;
  /** Extra room around the label when auto-sizing. */
  textPadding?: { x: number; y: number };
  /** Keep width and height equal (circles, state dots). */
  square?: boolean;
  /** The label sits outside the outline (actors). */
  labelOutside?: boolean;
  /** Compartments and other bespoke label painting (UML class). */
  paintsOwnLabel?: boolean;
  /** Default type settings for labels on this shape. */
  text?: TextStyle;
  /**
   * The Mermaid bracket pair for this shape. `null` means the element has no
   * Mermaid equivalent, so it is left out of exports and preserved across
   * edits to the code rather than being destroyed by them.
   */
  mermaid: MermaidMapping | null;
  geometry(ctx: ShapeContext): ShapeGeometry;
}
