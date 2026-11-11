/**
 * SVG path handling for user-defined shapes.
 *
 * Custom shapes are stored as a path in a 0..1 box so they scale to whatever
 * size the node is. Only path data is accepted — never whole SVG documents —
 * which keeps anything executable out of a shape library that other people's
 * files can reach.
 */

/** Parameters per command, and which axis each one scales along. */
const SIGNATURES: Record<string, (0 | 1 | -1)[]> = {
  m: [0, 1],
  l: [0, 1],
  h: [0],
  v: [1],
  c: [0, 1, 0, 1, 0, 1],
  s: [0, 1, 0, 1],
  q: [0, 1, 0, 1],
  t: [0, 1],
  // rx ry x-rotation large-arc sweep x y — the middle three never scale.
  a: [0, 1, -1, -1, -1, 0, 1],
  z: [],
};

const TOKEN = /([astvzqmhlc])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

export interface PathCommand {
  letter: string;
  /** Lowercase command, so relative and absolute share a signature. */
  code: string;
  relative: boolean;
  params: number[];
}

export class PathError extends Error {}

/** Parse path data into commands, or throw a `PathError` explaining why not. */
export function parsePath(d: string): PathCommand[] {
  if (!d.trim()) throw new PathError('The path is empty.');
  if (/[<>]/.test(d)) throw new PathError('That looks like SVG markup. Paste just the "d" attribute.');
  const tokens = [...d.matchAll(TOKEN)];
  const consumed = tokens.reduce((n, t) => n + t[0].length, 0);
  const stripped = d.replace(/[\s,]/g, '').length;
  if (consumed < stripped) throw new PathError('The path contains characters that are not path data.');

  const commands: PathCommand[] = [];
  let i = 0;
  let current: string | null = null;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token[1]) {
      current = token[1];
      i++;
    } else if (!current) {
      throw new PathError('The path must start with a command letter such as M.');
    }
    const letter = current!;
    const code = letter.toLowerCase();
    const signature = SIGNATURES[code];
    if (!signature) throw new PathError(`Unsupported path command "${letter}".`);
    if (signature.length === 0) {
      commands.push({ letter, code, relative: letter === code, params: [] });
      continue;
    }
    const params: number[] = [];
    while (params.length < signature.length) {
      const next = tokens[i];
      if (!next || next[1]) throw new PathError(`Command "${letter}" is missing numbers.`);
      params.push(Number(next[2]));
      i++;
    }
    if (params.some((n) => !Number.isFinite(n))) throw new PathError('The path contains a number that is not valid.');
    commands.push({ letter, code, relative: letter === code, params });
    // A repeated parameter run continues the same command (implicit repeat).
  }
  if (!commands.some((c) => c.code !== 'z')) throw new PathError('The path draws nothing.');
  return commands;
}

export function serializePath(commands: PathCommand[]): string {
  return commands
    .map((c) => (c.params.length ? `${c.letter} ${c.params.map(round).join(' ')}` : c.letter))
    .join(' ')
    .trim();
}

const round = (n: number): number => Math.round(n * 10000) / 10000;

/** Scale a unit-box path up to a node's size. */
export function scaleUnitPath(d: string, w: number, h: number): string {
  const commands = parsePath(d);
  return serializePath(
    commands.map((c) => ({
      ...c,
      params: c.params.map((value, i) => {
        const axis = SIGNATURES[c.code][i];
        if (axis === -1) return value;
        return value * (axis === 0 ? w : h);
      }),
    })),
  );
}

export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounds of every point in the path, including curve control points. That is
 * the convex hull of the curve rather than its exact extent, which is the
 * right trade here: a shape never escapes its box.
 */
export function pathBounds(commands: PathCommand[]): PathBounds {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const bounds: PathBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const see = (px: number, py: number) => {
    bounds.minX = Math.min(bounds.minX, px);
    bounds.minY = Math.min(bounds.minY, py);
    bounds.maxX = Math.max(bounds.maxX, px);
    bounds.maxY = Math.max(bounds.maxY, py);
  };
  for (const c of commands) {
    const rel = c.relative;
    switch (c.code) {
      case 'z':
        x = startX;
        y = startY;
        break;
      case 'h':
        x = rel ? x + c.params[0] : c.params[0];
        see(x, y);
        break;
      case 'v':
        y = rel ? y + c.params[0] : c.params[0];
        see(x, y);
        break;
      case 'a': {
        const [, , , , , ax, ay] = c.params;
        x = rel ? x + ax : ax;
        y = rel ? y + ay : ay;
        see(x, y);
        break;
      }
      default: {
        for (let i = 0; i + 1 < c.params.length; i += 2) {
          const px = rel ? x + c.params[i] : c.params[i];
          const py = rel ? y + c.params[i + 1] : c.params[i + 1];
          see(px, py);
          if (i + 2 >= c.params.length) {
            x = px;
            y = py;
          }
        }
        if (c.code === 'm') {
          startX = x;
          startY = y;
        }
        break;
      }
    }
  }
  if (!Number.isFinite(bounds.minX)) throw new PathError('The path has no drawable points.');
  return bounds;
}

/**
 * Move and scale pasted path data into the 0..1 box, so a shape copied out of
 * any drawing tool lands at a usable size whatever coordinates it used.
 */
export function fitPathToUnitBox(d: string): string {
  const commands = parsePath(d);
  const bounds = pathBounds(commands);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 && height <= 0) throw new PathError('The path has no size.');
  const scale = 1 / Math.max(width || height, height || width);
  // Centre the smaller axis so a wide or tall shape is not stretched.
  const offsetX = (1 - width * scale) / 2;
  const offsetY = (1 - height * scale) / 2;

  let penX = 0;
  let penY = 0;
  const mapped = commands.map((c) => {
    const params = [...c.params];
    switch (c.code) {
      case 'z':
        break;
      case 'h':
        params[0] = c.relative ? params[0] * scale : (params[0] - bounds.minX) * scale + offsetX;
        penX = c.relative ? penX + params[0] : params[0];
        break;
      case 'v':
        params[0] = c.relative ? params[0] * scale : (params[0] - bounds.minY) * scale + offsetY;
        penY = c.relative ? penY + params[0] : params[0];
        break;
      case 'a':
        params[0] *= scale;
        params[1] *= scale;
        params[5] = c.relative ? params[5] * scale : (params[5] - bounds.minX) * scale + offsetX;
        params[6] = c.relative ? params[6] * scale : (params[6] - bounds.minY) * scale + offsetY;
        break;
      default:
        for (let i = 0; i + 1 < params.length; i += 2) {
          params[i] = c.relative ? params[i] * scale : (params[i] - bounds.minX) * scale + offsetX;
          params[i + 1] = c.relative ? params[i + 1] * scale : (params[i + 1] - bounds.minY) * scale + offsetY;
        }
        break;
    }
    return { ...c, params };
  });
  return serializePath(mapped);
}

/** True when `d` is path data we can store and draw. */
export function isValidPath(d: string): boolean {
  try {
    parsePath(d);
    return true;
  } catch {
    return false;
  }
}
