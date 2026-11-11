/**
 * Shared scaffolding for stories: sample documents, a throwaway editor, and
 * the frames that make a panel or canvas look the way it does in the app.
 *
 * Story editors never touch localStorage, so browsing the component library
 * cannot read or overwrite anyone's real diagrams.
 */
import { layoutDiagram, resolveOverlaps } from '../core/layout';
import { emptyDiagram, makeNode, type Diagram, type NodeShape } from '../core/model';
import { Store } from '../core/store';
import { Editor } from '../editor';
import { parseMermaid } from '../mermaid/parse';
import { fitNodeSize } from '../render/shapes';

export const FIXTURES = {
  orderFlow: `flowchart TD
    start(["Order received"]) --> stock{"In stock?"}
    stock -->|Yes| charge["Charge the card"]
    charge --> pack["Pack the order"]
    pack --> ship["Hand to the courier"]
    ship --> record[("Save the tracking number")]
    stock -->|No| notify[/"Email the customer"/]
    record --> done(["Done"])
    notify --> done`,

  /** Has an edge that skips a rank, which auto-arrange gives its own lane. */
  lanes: `flowchart TD
    open["Open pull request"] --> ci{"CI green?"}
    ci -->|No| fix["Push a fix"]
    fix --> ci
    ci -->|Yes| review["Request review"]
    review --> approved{"Approved?"}
    approved -->|No| fix
    approved -->|Yes| merge(["Merge"])
    open --> merge`,

  classModel: `classDiagram
    class Order {
      <<aggregate>>
      +string id
      +Money total
      +submit()
      +cancel()
    }
    class Customer {
      +string name
      +Address billing
    }
    class OrderLine {
      +int quantity
    }
    Customer "1" --> "*" Order : places
    Order *-- OrderLine
    Order ..> Mailer : notifies
    Customer <|-- PremiumCustomer`,

  tiny: `flowchart LR
    a["Draft"] --> b{"Approved?"}
    b -->|Yes| c(["Publish"])
    b -->|No| a`,
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Parse one of the fixtures (or any Mermaid) into a laid-out document. */
export function diagramFrom(code: string, name = 'Story diagram'): Diagram {
  const { diagram, errors } = parseMermaid(code, name);
  if (!diagram) throw new Error(`Story fixture did not parse: ${errors[0]?.message ?? 'unknown'}`);
  layoutDiagram(diagram);
  resolveOverlaps(diagram);
  return diagram;
}

export function fixture(name: FixtureName): Diagram {
  return diagramFrom(FIXTURES[name], name);
}

/** Every shape in the palette, laid out in a grid — a visual inventory. */
export function shapeShowcase(shapes: NodeShape[], perRow = 5): Diagram {
  const doc = emptyDiagram('Shapes');
  shapes.forEach((shape, i) => {
    const node = makeNode({ x: 0, y: 0, shape, label: labelFor(shape) });
    if (shape === 'class') {
      node.attributes = ['+id: string'];
      node.methods = ['+save()'];
    }
    const size = fitNodeSize(node);
    node.w = size.w;
    node.h = size.h;
    node.x = 40 + (i % perRow) * 230;
    node.y = 40 + Math.floor(i / perRow) * 170;
    doc.nodes.push(node);
  });
  return doc;
}

function labelFor(shape: NodeShape): string {
  return shape
    .split('-')
    .map((part, i) => (i ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

export interface StoryEditor {
  editor: Editor;
  host: HTMLElement;
}

/** Editors created by stories, disposed when the next story mounts. */
const live = new Set<Editor>();

export function disposeStoryEditors(): void {
  for (const editor of live) editor.destroy();
  live.clear();
}

/**
 * An editor on a detached host. The host is sized by CSS, so the initial fit
 * waits for the browser to lay it out.
 */
export function storyEditor(options: { doc?: Diagram; theme?: 'light' | 'dark'; grid?: boolean } = {}): StoryEditor {
  disposeStoryEditors();
  const doc = options.doc ?? fixture('orderFlow');
  const store = new Store({
    doc,
    persist: false,
    prefs: { theme: options.theme ?? currentTheme(), grid: options.grid ?? true },
  });
  const host = document.createElement('div');
  host.className = 'canvas-host';
  const editor = new Editor(host, store);
  live.add(editor);
  requestAnimationFrame(() => editor.fit());
  return { editor, host };
}

export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Wrap a side-panel component in something the size of the real sidebar. */
export function panelFrame(el: HTMLElement, variant: '' | 'wide' | 'narrow' = ''): HTMLElement {
  const frame = document.createElement('div');
  frame.className = `sb-panel ${variant}`.trim();
  frame.append(el);
  return frame;
}

/** Wrap a canvas host so it has a size to render into. */
export function canvasFrame(host: HTMLElement): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'sb-canvas';
  frame.append(host);
  return frame;
}

export function note(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'sb-note';
  p.textContent = text;
  return p;
}

export function stack(...children: (Node | null | undefined)[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sb-stack';
  for (const child of children) if (child) el.append(child);
  return el;
}

export function row(...children: (Node | null | undefined)[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sb-row';
  for (const child of children) if (child) el.append(child);
  return el;
}

export function label(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sb-label';
  el.textContent = text;
  return el;
}

/** A small PNG made on the fly, for stories that need an uploaded image. */
export async function sampleImageFile(name = 'whiteboard.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1f2933';
  ctx.lineWidth = 3;
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#1f2933';
  const box = (x: number, y: number, w: number, h: number, text: string) => {
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(text, x + 14, y + h / 2 + 5);
  };
  box(60, 30, 160, 54, 'Collect form');
  box(60, 140, 160, 54, 'Validate');
  box(260, 140, 160, 54, 'Save');
  ctx.beginPath();
  ctx.moveTo(140, 84);
  ctx.lineTo(140, 140);
  ctx.moveTo(220, 167);
  ctx.lineTo(260, 167);
  ctx.stroke();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new File([blob!], name, { type: 'image/png' });
}
