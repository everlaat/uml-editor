import type { Editor } from '../editor';
import { mermaidFidelity } from '../mermaid/fidelity';
import { parseMermaid } from '../mermaid/parse';
import { toMermaid } from '../mermaid/serialize';
import { copyText, pickFile } from '../io/export';
import { button, clearChildren, h } from './dom';
import { toast } from './toast';

const SAMPLE = `flowchart TD
    start(["Order received"]) --> stock{"In stock?"}
    stock -->|Yes| pack["Pack the order"]
    stock -->|No| backorder["Create backorder"]
    backorder --> notify[/"Email the customer"/]
    pack --> ship["Hand to courier"]
    ship --> db[("Save tracking number")]
    db --> done(["Done"])
    notify --> done`;

/**
 * Two-way Mermaid panel. Typing applies to the canvas after a short pause and
 * keeps the positions of shapes that survive the edit; canvas edits rewrite the
 * code whenever the editor is not focused.
 */
export function createCodePanel(editor: Editor): { el: HTMLElement; sync: () => void } {
  const area = h('textarea', { class: 'code-area mono', placeholder: 'flowchart TD\n  a["Step"] --> b["Next"]' });
  area.spellcheck = false;
  const problems = h('div', { class: 'problems' });
  const fidelity = h('details', { class: 'fidelity' });
  let applying = false;
  let timer: number | undefined;
  let dirty = false;

  const sync = () => {
    if (applying || document.activeElement === area) return;
    const next = toMermaid(editor.store.doc);
    if (next !== area.value) area.value = next;
    dirty = false;
    clearChildren(problems);
    renderFidelity();
  };

  /**
   * Mermaid describes structure, not appearance. Rather than silently dropping
   * what it cannot say, the panel lists it — and the editor keeps those
   * elements when the code is applied.
   */
  const renderFidelity = () => {
    const issues = mermaidFidelity(editor.store.doc);
    clearChildren(fidelity);
    if (!issues.length) {
      fidelity.open = false;
      fidelity.append(
        h('summary', { class: 'fidelity-ok', text: 'This diagram survives a round trip through Mermaid.' }),
      );
      return;
    }
    fidelity.append(
      h('summary', {
        text: `${issues.length} thing${issues.length === 1 ? '' : 's'} Mermaid cannot carry — click for detail`,
      }),
    );
    const list = h('ul');
    for (const issue of issues) list.append(h('li', { text: issue.message }));
    list.append(h('li', { text: 'Export as JSON to keep everything exactly as it is.' }));
    fidelity.append(list);
  };

  const apply = (announce = false) => {
    const code = area.value.trim();
    if (!code) return;
    const result = parseMermaid(code, editor.store.doc.name);
    clearChildren(problems);
    if (!result.diagram) {
      for (const issue of result.errors.slice(0, 4)) {
        problems.append(h('div', { class: 'problem error', text: `Line ${issue.line}: ${issue.message}` }));
      }
      return false;
    }
    for (const issue of result.warnings.slice(0, 3)) {
      problems.append(h('div', { class: 'problem warn', text: `Line ${issue.line}: ${issue.message}` }));
    }
    applying = true;
    try {
      editor.applyDiagram(result.diagram, { preservePositions: true, preserveCanvasOnly: true, label: 'mermaid' });
    } finally {
      applying = false;
    }
    dirty = false;
    if (announce) toast('Diagram updated from Mermaid');
    return true;
  };

  area.addEventListener('input', () => {
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => apply(), 600);
  });
  area.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      window.clearTimeout(timer);
      apply(true);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = area.selectionStart;
      area.setRangeText('    ', start, area.selectionEnd, 'end');
    }
  });
  area.addEventListener('blur', () => {
    if (dirty) {
      window.clearTimeout(timer);
      apply();
    }
    sync();
  });

  editor.store.subscribe(() => sync());

  const actions = h(
    'div',
    { class: 'code-actions' },
    button('Apply', () => apply(true), { title: 'Apply the code to the canvas (⌘↵)' }),
    button('Copy', async () => {
      const ok = await copyText(area.value);
      toast(ok ? 'Mermaid copied' : 'Could not reach the clipboard');
    }),
    button('Import file…', async () => {
      const file = await pickFile('.mmd,.mermaid,.md,.txt,text/plain');
      if (!file) return;
      const text = await file.text();
      area.value = extractFromMarkdown(text);
      if (apply(true)) editor.fit();
    }),
    button('Sample', () => {
      area.value = SAMPLE;
      if (apply(true)) editor.fit();
    }),
  );

  const el = h(
    'div',
    { class: 'code-panel' },
    h('div', { class: 'panel-label', text: 'Mermaid' }),
    area,
    problems,
    fidelity,
    actions,
    h('p', {
      class: 'palette-hint',
      text: 'Edits apply as you type. flowchart/graph and classDiagram are supported, including subgraphs and edge labels.',
    }),
  );

  sync();
  return { el, sync };
}

/** Pulls the first mermaid fence out of a markdown file, else returns the text. */
export function extractFromMarkdown(text: string): string {
  const fence = /```mermaid\s*([\s\S]*?)```/i.exec(text);
  return (fence ? fence[1] : text).trim();
}
