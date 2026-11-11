/**
 * The user's own shapes. A custom shape is a name plus an outline in a 0..1
 * box; it is stored in this browser, registered like any built-in, and carried
 * on the nodes that use it so shared documents still draw.
 */
import { uid } from '../core/model';
import { fitPathToUnitBox, parsePath, PathError, scaleUnitPath } from './path';
import { registerShape, unregisterShape } from './registry';
import type { ShapeDefinition } from './types';

const STORAGE_KEY = 'umlx.shapes.v1';
export const CUSTOM_PREFIX = 'custom:';

export interface CustomShape {
  id: string;
  name: string;
  /** Outline in a 0..1 box. */
  path: string;
  createdAt: number;
  defaultSize?: { w: number; h: number };
}

function read(): CustomShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomShape[];
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.path === 'string') : [];
  } catch {
    return [];
  }
}

function write(shapes: CustomShape[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shapes));
  } catch {
    /* storage full or blocked — the shape stays registered for this session */
  }
}

export function listCustomShapes(): CustomShape[] {
  return read().sort((a, b) => a.name.localeCompare(b.name));
}

export function definitionFor(shape: CustomShape): ShapeDefinition {
  const size = shape.defaultSize ?? { w: 140, h: 120 };
  return {
    id: `${CUSTOM_PREFIX}${shape.id}`,
    name: shape.name,
    category: 'custom',
    hint: 'One of your own shapes',
    defaultSize: size,
    // No Mermaid bracket can describe a drawing, so exports say so instead of
    // quietly turning it into a rectangle.
    mermaid: null,
    geometry: ({ w, h }) => ({
      path: scaleUnitPath(shape.path, w, h),
      textBox: { x: w * 0.14, y: h * 0.14, w: w * 0.72, h: h * 0.72 },
    }),
  };
}

/** Register everything in the library. Call once at start-up. */
export function loadCustomShapes(): CustomShape[] {
  const shapes = listCustomShapes();
  for (const shape of shapes) registerShape(definitionFor(shape));
  return shapes;
}

export interface SaveResult {
  shape?: CustomShape;
  error?: string;
}

/**
 * Validate pasted path data, normalise it into the unit box and store it.
 * Returns a message rather than throwing, because this is driven by a form.
 */
export function saveCustomShape(name: string, pathData: string, defaultSize?: { w: number; h: number }): SaveResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: 'Give the shape a name.' };
  let path: string;
  try {
    parsePath(pathData);
    path = fitPathToUnitBox(pathData);
  } catch (err) {
    return { error: err instanceof PathError ? err.message : 'That is not usable path data.' };
  }
  const shapes = read();
  const existing = shapes.find((s) => s.name.toLowerCase() === trimmedName.toLowerCase());
  const shape: CustomShape = {
    id: existing?.id ?? uid('s'),
    name: trimmedName,
    path,
    createdAt: existing?.createdAt ?? Date.now(),
    defaultSize,
  };
  write([...shapes.filter((s) => s.id !== shape.id), shape]);
  registerShape(definitionFor(shape));
  return { shape };
}

export function deleteCustomShape(id: string): void {
  write(read().filter((s) => s.id !== id));
  unregisterShape(`${CUSTOM_PREFIX}${id}`);
}

export function isCustomShapeId(shapeId: string): boolean {
  return shapeId.startsWith(CUSTOM_PREFIX);
}

/** The stored path for a shape id, if this browser has it. */
export function pathForShapeId(shapeId: string): string | undefined {
  if (!isCustomShapeId(shapeId)) return undefined;
  const id = shapeId.slice(CUSTOM_PREFIX.length);
  return read().find((s) => s.id === id)?.path;
}
