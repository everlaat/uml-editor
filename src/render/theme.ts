export interface PaletteEntry {
  name: string;
  fill: string;
  stroke: string;
  text: string;
}

export interface ThemeTokens {
  surface: string;
  grid: string;
  gridStrong: string;
  text: string;
  textMuted: string;
  edge: string;
  edgeLabelBg: string;
  accent: string;
  group: string;
  groupStroke: string;
  palette: Record<string, PaletteEntry>;
}

const DARK_PALETTE: Record<string, PaletteEntry> = {
  default: { name: 'Default', fill: '#1d2430', stroke: '#48566b', text: '#e8edf5' },
  slate: { name: 'Slate', fill: '#2b3442', stroke: '#64748b', text: '#eef2f8' },
  blue: { name: 'Blue', fill: '#16314f', stroke: '#3b82f6', text: '#dbeafe' },
  teal: { name: 'Teal', fill: '#10353a', stroke: '#14b8a6', text: '#ccfbf1' },
  green: { name: 'Green', fill: '#14321f', stroke: '#22c55e', text: '#dcfce7' },
  amber: { name: 'Amber', fill: '#3a2c10', stroke: '#f59e0b', text: '#fef3c7' },
  red: { name: 'Red', fill: '#3d1a1d', stroke: '#ef4444', text: '#fee2e2' },
  violet: { name: 'Violet', fill: '#2a1f4a', stroke: '#8b5cf6', text: '#ede9fe' },
  pink: { name: 'Pink', fill: '#3b1930', stroke: '#ec4899', text: '#fce7f3' },
};

const LIGHT_PALETTE: Record<string, PaletteEntry> = {
  default: { name: 'Default', fill: '#ffffff', stroke: '#94a3b8', text: '#0f172a' },
  slate: { name: 'Slate', fill: '#f1f5f9', stroke: '#64748b', text: '#0f172a' },
  blue: { name: 'Blue', fill: '#e0edff', stroke: '#2563eb', text: '#10254a' },
  teal: { name: 'Teal', fill: '#d7f5f0', stroke: '#0d9488', text: '#0a3b36' },
  green: { name: 'Green', fill: '#dcfce7', stroke: '#16a34a', text: '#0d3320' },
  amber: { name: 'Amber', fill: '#fef3c7', stroke: '#d97706', text: '#422006' },
  red: { name: 'Red', fill: '#fee2e2', stroke: '#dc2626', text: '#450a0a' },
  violet: { name: 'Violet', fill: '#ede9fe', stroke: '#7c3aed', text: '#2a1065' },
  pink: { name: 'Pink', fill: '#fce7f3', stroke: '#db2777', text: '#500724' },
};

export const PALETTE_KEYS = Object.keys(DARK_PALETTE);

const DARK: ThemeTokens = {
  surface: '#0d1117',
  grid: '#1b2230',
  gridStrong: '#243044',
  text: '#e8edf5',
  textMuted: '#93a1b5',
  edge: '#7b8aa1',
  edgeLabelBg: '#0d1117',
  accent: '#4f8cff',
  group: 'rgba(79,140,255,0.05)',
  groupStroke: '#38445c',
  palette: DARK_PALETTE,
};

const LIGHT: ThemeTokens = {
  surface: '#f7f8fb',
  grid: '#e6e9f0',
  gridStrong: '#d6dbe6',
  text: '#0f172a',
  textMuted: '#5b6678',
  edge: '#64748b',
  edgeLabelBg: '#f7f8fb',
  accent: '#2563eb',
  group: 'rgba(37,99,235,0.04)',
  groupStroke: '#c7cedb',
  palette: LIGHT_PALETTE,
};

export function themeFor(mode: 'light' | 'dark'): ThemeTokens {
  return mode === 'light' ? LIGHT : DARK;
}

/** Resolve a node colour, which may be a palette token or a raw CSS colour. */
export function resolveColor(theme: ThemeTokens, color: string | undefined): PaletteEntry {
  if (!color) return theme.palette.default;
  const token = theme.palette[color];
  if (token) return token;
  return { name: color, fill: color, stroke: mixStroke(color), text: readableText(color) };
}

function mixStroke(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return '#64748b';
  const [r, g, b] = rgb.map((c) => Math.max(0, Math.round(c * 0.6)));
  return `rgb(${r},${g},${b})`;
}

export function readableText(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return '#0f172a';
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#0f172a' : '#f8fafc';
}

function parseColor(color: string): [number, number, number] | null {
  const hex = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  if (short) {
    const [a, b, c] = short[1].split('');
    return [parseInt(a + a, 16), parseInt(b + b, 16), parseInt(c + c, 16)];
  }
  const long = /^#([0-9a-f]{6})$/i.exec(hex);
  if (long) {
    return [
      parseInt(long[1].slice(0, 2), 16),
      parseInt(long[1].slice(2, 4), 16),
      parseInt(long[1].slice(4, 6), 16),
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(hex);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  }
  return null;
}
