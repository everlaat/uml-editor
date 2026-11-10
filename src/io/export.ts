import { f } from '../core/geometry';
import type { Diagram } from '../core/model';
import type { Scene } from '../render/scene';
import { SVGNS } from '../render/svg';

export interface ExportOptions {
  /** Paint a solid background instead of leaving it transparent. */
  background?: string | null;
  padding?: number;
  scale?: number;
}

/** Serialise the live scene to a standalone SVG document. */
export function toSvgString(scene: Scene, doc: Diagram, opts: ExportOptions = {}): string {
  const padding = opts.padding ?? 32;
  const bounds = scene.contentBounds(doc, padding) ?? { x: 0, y: 0, w: 400, h: 300 };
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('xmlns', SVGNS);
  svg.setAttribute('width', f(bounds.w));
  svg.setAttribute('height', f(bounds.h));
  svg.setAttribute('viewBox', `${f(bounds.x)} ${f(bounds.y)} ${f(bounds.w)} ${f(bounds.h)}`);

  if (opts.background) {
    const bg = document.createElementNS(SVGNS, 'rect');
    bg.setAttribute('x', f(bounds.x));
    bg.setAttribute('y', f(bounds.y));
    bg.setAttribute('width', f(bounds.w));
    bg.setAttribute('height', f(bounds.h));
    bg.setAttribute('fill', opts.background);
    svg.append(bg);
  }

  for (const cls of ['.layer-groups', '.layer-edges', '.layer-nodes']) {
    const layer = scene.svg.querySelector(cls);
    if (!layer) continue;
    const clone = layer.cloneNode(true) as SVGGElement;
    clone.removeAttribute('class');
    for (const hit of clone.querySelectorAll('.edge-hit')) hit.remove();
    svg.append(clone);
  }
  return new XMLSerializer().serializeToString(svg);
}

export async function toPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not rasterise the diagram.'));
      img.src = url;
    });
    const width = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 600) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the PNG.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(filename: string, data: string | Blob, mime = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${mime};charset=utf-8` }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'diagram'
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard permission.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}
