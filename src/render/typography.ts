import type { TextFont, TextStyle } from '../core/model';
import type { ShapeDefinition } from '../shapes/types';

/** Only system fonts: no network at render time, and exports stay faithful. */
export const FONT_STACKS: Record<TextFont, string> = {
  sans: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive',
};

export const FONT_LABELS: Record<TextFont, string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Mono',
  hand: 'Handwritten',
};

export const DEFAULT_TEXT: Required<Pick<TextStyle, 'font' | 'size' | 'align' | 'valign' | 'lineHeight'>> = {
  font: 'sans',
  size: 14,
  align: 'center',
  valign: 'middle',
  lineHeight: 1.35,
};

/** A fully resolved style: shape defaults under the node's own overrides. */
export interface ResolvedText {
  font: TextFont;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  align: NonNullable<TextStyle['align']>;
  valign: NonNullable<TextStyle['valign']>;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  color?: string;
}

export function resolveText(style: TextStyle | undefined, shape?: ShapeDefinition): ResolvedText {
  const base = { ...DEFAULT_TEXT, ...shape?.text, ...style };
  const bold = style?.bold ?? shape?.text?.bold ?? false;
  return {
    font: base.font ?? 'sans',
    family: FONT_STACKS[base.font ?? 'sans'] ?? FONT_STACKS.sans,
    size: clampSize(base.size ?? DEFAULT_TEXT.size),
    weight: bold ? 700 : 500,
    italic: base.italic ?? false,
    underline: base.underline ?? false,
    align: base.align ?? DEFAULT_TEXT.align,
    valign: base.valign ?? DEFAULT_TEXT.valign,
    lineHeight: base.lineHeight ?? DEFAULT_TEXT.lineHeight,
    letterSpacing: base.letterSpacing ?? 0,
    uppercase: base.uppercase ?? false,
    color: base.color,
  };
}

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 96;

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_TEXT.size;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}

export function applyCase(text: string, style: ResolvedText): string {
  return style.uppercase ? text.toUpperCase() : text;
}
