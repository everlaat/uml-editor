import type { Editor } from '../editor';
import { toMermaid } from '../mermaid/serialize';
import { copyText, download, slugify, toPngBlob, toSvgString } from '../io/export';
import { themeFor } from '../render/theme';
import { h, iconButton } from './dom';
import { openDocsModal } from './docspanel';
import { openHelp } from './help';
import { icons } from './icons';
import { attachMenu } from './menu';
import { toast } from './toast';

export function createToolbar(editor: Editor, onThemeChange: (mode: 'light' | 'dark') => void): HTMLElement {
  const store = editor.store;

  const nameInput = h('input', {
    class: 'doc-title',
    value: store.doc.name,
    placeholder: 'Untitled diagram',
    attrs: { 'aria-label': 'Diagram name' },
  });
  nameInput.addEventListener('input', () => {
    store.patch((doc) => void (doc.name = nameInput.value), { label: 'rename', coalesce: 'rename' });
  });
  nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') nameInput.blur();
  });

  const undoBtn = iconButton(icons.undo, 'Undo (⌘Z)', () => store.undo());
  const redoBtn = iconButton(icons.redo, 'Redo (⇧⌘Z)', () => store.redo());
  const zoomLabel = h('button', {
    class: 'btn zoom-label',
    type: 'button',
    title: 'Reset zoom (⌘0)',
    text: '100%',
    on: {
      click: () => {
        editor.scene.setView({ zoom: 1 });
        editor.render();
      },
    },
  });

  const themeBtn = iconButton(
    store.prefs.theme === 'dark' ? icons.sun : icons.moon,
    'Switch between light and dark',
    () => {
      const next = store.prefs.theme === 'dark' ? 'light' : 'dark';
      store.setPrefs({ theme: next });
      onThemeChange(next);
      themeBtn.innerHTML = next === 'dark' ? icons.sun : icons.moon;
    },
  );

  const gridBtn = iconButton(icons.grid, 'Toggle the grid (G)', () => {
    store.setPrefs({ grid: !store.prefs.grid });
    editor.render();
    gridBtn.classList.toggle('active', store.prefs.grid);
  });
  gridBtn.classList.toggle('active', store.prefs.grid);

  const exportBtn = h('button', { class: 'btn', type: 'button', html: `${icons.download}<span>Export</span>` });
  attachMenu(exportBtn, () => [
    {
      label: 'Copy Mermaid',
      hint: 'clipboard',
      onSelect: async () => {
        const ok = await copyText(toMermaid(store.doc));
        toast(ok ? 'Mermaid copied' : 'Could not reach the clipboard', ok ? 'info' : 'error');
      },
    },
    {
      label: 'Mermaid file',
      hint: '.mmd',
      onSelect: () => download(`${slugify(store.doc.name)}.mmd`, toMermaid(store.doc), 'text/plain'),
    },
    {
      label: 'SVG',
      hint: 'vector',
      onSelect: () => {
        const svg = toSvgString(editor.scene, store.doc, { background: themeFor(store.prefs.theme).surface });
        download(`${slugify(store.doc.name)}.svg`, svg, 'image/svg+xml');
      },
    },
    {
      label: 'PNG',
      hint: '2×',
      onSelect: async () => {
        try {
          const svg = toSvgString(editor.scene, store.doc, { background: themeFor(store.prefs.theme).surface });
          const blob = await toPngBlob(svg, 2);
          download(`${slugify(store.doc.name)}.png`, blob);
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      },
    },
    {
      label: 'Diagram JSON',
      hint: 'full fidelity',
      onSelect: () =>
        download(`${slugify(store.doc.name)}.umlx.json`, JSON.stringify(store.doc, null, 2), 'application/json'),
    },
  ]);

  const bar = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'brand-mark', html: brandMark() }),
      h('span', { class: 'brand-name', text: 'UML Editor' }),
    ),
    nameInput,
    h('button', {
      class: 'btn',
      type: 'button',
      title: 'Saved diagrams',
      html: `${icons.docs}<span>Diagrams</span>`,
      on: { click: () => openDocsModal(editor) },
    }),
    h('div', { class: 'spacer' }),
    h('div', { class: 'group' }, undoBtn, redoBtn),
    h(
      'div',
      { class: 'group' },
      iconButton(icons.layout, 'Auto-arrange (⇧⌘L)', () => editor.autoLayout()),
      gridBtn,
    ),
    h(
      'div',
      { class: 'group' },
      iconButton(icons.zoomOut, 'Zoom out (⌘−)', () => editor.zoomBy(1 / 1.2)),
      zoomLabel,
      iconButton(icons.zoomIn, 'Zoom in (⌘+)', () => editor.zoomBy(1.2)),
      iconButton(icons.fit, 'Zoom to fit (⌘1)', () => editor.fit()),
    ),
    h('div', { class: 'group' }, themeBtn, exportBtn, iconButton(icons.keyboard, 'Shortcuts and help (?)', () => openHelp())),
  );

  const sync = () => {
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    if (document.activeElement !== nameInput && nameInput.value !== store.doc.name) nameInput.value = store.doc.name;
    zoomLabel.textContent = `${Math.round(editor.scene.view.zoom * 100)}%`;
  };
  store.subscribe(sync);
  editor.scene.svg.addEventListener('wheel', () => requestAnimationFrame(sync), { passive: true });
  editor.scene.svg.addEventListener('pointerup', () => requestAnimationFrame(sync));
  setInterval(sync, 500);
  sync();
  return bar;
}

function brandMark(): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
    <rect x="8" y="2.5" width="8" height="5" rx="1.5"/>
    <rect x="2" y="16.5" width="8" height="5" rx="1.5"/>
    <rect x="14" y="16.5" width="8" height="5" rx="1.5"/>
    <path d="M12 7.5v4M12 11.5H6v5M12 11.5h6v5" stroke-linecap="round"/>
  </svg>`;
}
