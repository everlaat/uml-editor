import { Store } from './core/store';
import { loadCustomShapes } from './shapes/custom';
import { listDocs, loadDoc } from './core/storage';
import { Editor } from './editor';
import { parseMermaid } from './mermaid/parse';
import { createAiPanel } from './ui/aipanel';
import { createCodePanel } from './ui/codepanel';
import { h } from './ui/dom';
import { createInspector } from './ui/inspector';
import { createPalette, enableShapeDrop } from './ui/palette';
import { createToolbar } from './ui/toolbar';
import { toast } from './ui/toast';
import { openHelp } from './ui/help';
import './styles.css';

const WELCOME = `flowchart TD
    idea(["Describe it"]) --> draw["Draw it"]
    draw --> tweak{"Looks right?"}
    tweak -->|No| draw
    tweak -->|Yes| save[("Saved in your browser")]
    save --> share[/"Export SVG, PNG or Mermaid"/]`;

function boot(): void {
  // Shapes first: a document may reference one of the user's own elements.
  loadCustomShapes();
  const store = new Store();

  // First visit: start from a small example rather than a blank canvas.
  if (!listDocs().length && !store.doc.nodes.length) {
    const parsed = parseMermaid(WELCOME, 'Welcome');
    if (parsed.diagram) {
      parsed.diagram.id = store.doc.id;
      store.doc = parsed.diagram;
    }
  }

  const root = document.getElementById('app')!;
  root.classList.add('app');
  document.documentElement.dataset.theme = store.prefs.theme;

  const canvasHost = h('div', { class: 'canvas-host', id: 'canvas' });
  const editor = new Editor(canvasHost, store);

  const toolbar = createToolbar(editor, (mode) => {
    document.documentElement.dataset.theme = mode;
    editor.setTheme(mode);
  });

  const inspector = createInspector(editor);
  const code = createCodePanel(editor);
  const ai = createAiPanel(editor);

  const tabs = [
    { id: 'inspect', label: 'Properties', el: inspector.el },
    { id: 'code', label: 'Mermaid', el: code.el },
    { id: 'ai', label: 'Generate', el: ai.el },
  ];
  const tabBar = h('div', { class: 'tabbar' });
  const tabBody = h('div', { class: 'tab-body' });
  let active = 'inspect';
  const setTab = (id: string) => {
    active = id;
    for (const btn of tabBar.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.tab === id);
    tabBody.replaceChildren(tabs.find((t) => t.id === id)!.el);
    if (id === 'code') code.sync();
  };
  for (const tab of tabs) {
    const btn = h('button', { class: 'tab', type: 'button', text: tab.label, on: { click: () => setTab(tab.id) } });
    btn.dataset.tab = tab.id;
    tabBar.append(btn);
  }

  const status = h('div', { class: 'statusbar' });
  const statusText = h('span', { class: 'status-text' });
  const saveState = h('span', { class: 'status-save', text: 'Saved locally' });
  status.append(statusText, h('span', { class: 'spacer' }), saveState);

  const sidebarLeft = h('aside', { class: 'sidebar left' }, createPalette(editor));
  const sidebarRight = h('aside', { class: 'sidebar right' }, tabBar, tabBody);

  root.append(
    toolbar,
    h('div', { class: 'workspace' }, sidebarLeft, h('main', { class: 'canvas-wrap' }, canvasHost), sidebarRight),
    status,
  );
  setTab(active);
  enableShapeDrop(editor, canvasHost, (file) => {
    // An image dropped on the canvas is a diagram to read, not a shape.
    setTab('ai');
    void ai.attachImage(file);
  });

  // The canvas only has its real size once the panels are in the DOM.
  requestAnimationFrame(() => {
    if (!store.doc.view) {
      if (store.doc.nodes.every((n) => n.x === 0 && n.y === 0)) editor.autoLayout();
      else editor.fit();
    } else {
      editor.scene.setView(store.doc.view);
      editor.render();
    }
  });

  const updateStatus = (reason: string) => {
    const doc = store.doc;
    const sel = store.selection.nodes.size + store.selection.edges.size;
    statusText.textContent = `${doc.nodes.length} shapes · ${doc.edges.length} connections${sel ? ` · ${sel} selected` : ''}`;
    if (reason === 'save-error') {
      saveState.textContent = 'Could not save — browser storage is full or blocked';
      saveState.classList.add('error');
    } else if (!store.hasSaveError()) {
      saveState.textContent = 'Saved in this browser';
      saveState.classList.remove('error');
    }
  };
  store.subscribe((_doc, reason) => updateStatus(reason));
  updateStatus('init');

  window.addEventListener('beforeunload', () => {
    editor.commitLabel();
    store.flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });

  // Reopening the tab elsewhere should not clobber newer edits silently.
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith('umlx.doc.') || !e.key.endsWith(store.doc.id)) return;
    const incoming = loadDoc(store.doc.id);
    if (incoming && incoming.updatedAt > store.doc.updatedAt + 1000) {
      toast('This diagram changed in another tab. Reload to see the newer version.', 'error', 6000);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '?' && !(e.target as HTMLElement)?.closest('input, textarea')) {
      e.preventDefault();
      openHelp();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setTab(active === 'ai' ? 'inspect' : 'ai');
      (tabBody.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
    }
  });

  // Jump straight into a diagram from a shared link: #mermaid=<encoded>
  const hash = new URLSearchParams(location.hash.slice(1));
  const shared = hash.get('mermaid');
  if (shared) {
    try {
      const parsed = parseMermaid(decodeURIComponent(escape(atob(shared))), 'Shared diagram');
      if (parsed.diagram) {
        editor.applyDiagram(parsed.diagram, { preservePositions: false, relayout: true, label: 'shared' });
        editor.fit();
        toast('Loaded the diagram from the link');
      }
    } catch {
      toast('That link did not contain a readable diagram', 'error');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
}

boot();
