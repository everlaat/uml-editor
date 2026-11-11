import { emptyDiagram, type Diagram } from './model';
import { DEFAULT_PREFS, loadDoc, loadPrefs, saveDoc, savePrefs, type Prefs } from './storage';

export interface Selection {
  nodes: Set<string>;
  edges: Set<string>;
}

export interface PatchOptions {
  label?: string;
  /** Patches sharing a coalesce key within `COALESCE_MS` collapse into one undo step. */
  coalesce?: string;
  /** Skip the history stack entirely (viewport changes, etc.). */
  silent?: boolean;
}

type Listener = (doc: Diagram, reason: string) => void;

export interface StoreOptions {
  /** Start from this document instead of the last one in storage. */
  doc?: Diagram;
  /** Overrides on top of the stored preferences. */
  prefs?: Partial<Prefs>;
  /**
   * Write through to localStorage. Off for stories and tests, which should
   * neither read the person's diagrams nor leave any behind.
   */
  persist?: boolean;
}

const COALESCE_MS = 700;
const MAX_HISTORY = 120;

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Single source of truth: the current diagram, selection, prefs, undo history
 * and debounced persistence. Snapshot-based history keeps mutations trivial to
 * write while staying cheap for documents of this size.
 */
export class Store {
  doc: Diagram;
  prefs: Prefs;
  selection: Selection = { nodes: new Set(), edges: new Set() };

  private undoStack: { doc: Diagram; label: string }[] = [];
  private redoStack: { doc: Diagram; label: string }[] = [];
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;
  private lastCoalesce: { key: string; at: number } | null = null;
  private saveFailed = false;
  private readonly persist: boolean;

  constructor(options: StoreOptions = {}) {
    this.persist = options.persist ?? true;
    this.prefs = { ...(this.persist ? loadPrefs() : DEFAULT_PREFS), ...options.prefs };
    if (options.doc) {
      this.doc = options.doc;
    } else {
      const last = this.persist && this.prefs.lastDocId ? loadDoc(this.prefs.lastDocId) : null;
      this.doc = last ?? emptyDiagram();
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason = 'change'): void {
    for (const fn of this.listeners) fn(this.doc, reason);
  }

  /** Apply a mutation to the document, recording an undo step. */
  patch(mutate: (doc: Diagram) => void, opts: PatchOptions = {}): void {
    const before = opts.silent ? null : clone(this.doc);
    const counts = [this.doc.nodes.length, this.doc.edges.length];
    mutate(this.doc);
    this.doc.updatedAt = Date.now();
    // Anything removed must leave the selection too, or panels read dead ids.
    if (this.doc.nodes.length !== counts[0] || this.doc.edges.length !== counts[1]) {
      this.pruneSelection();
    }

    if (before) {
      const now = Date.now();
      const coalescing =
        !!opts.coalesce &&
        this.lastCoalesce?.key === opts.coalesce &&
        now - this.lastCoalesce.at < COALESCE_MS &&
        this.undoStack.length > 0;
      if (!coalescing) {
        this.undoStack.push({ doc: before, label: opts.label ?? 'edit' });
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      }
      this.lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
      this.redoStack = [];
    }

    this.scheduleSave();
    this.emit(opts.label ?? 'change');
  }

  /** Replace the whole document (open, import, generate). Undoable. */
  replaceDoc(doc: Diagram, label = 'replace'): void {
    this.undoStack.push({ doc: clone(this.doc), label });
    this.redoStack = [];
    this.lastCoalesce = null;
    this.doc = doc;
    this.selection = { nodes: new Set(), edges: new Set() };
    this.rememberDoc(doc);
    this.scheduleSave();
    this.emit(label);
  }

  /** Switch documents without polluting history (used by the document list). */
  openDoc(doc: Diagram): void {
    this.flush();
    this.undoStack = [];
    this.redoStack = [];
    this.doc = doc;
    this.selection = { nodes: new Set(), edges: new Set() };
    this.rememberDoc(doc);
    this.scheduleSave();
    this.emit('open');
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push({ doc: clone(this.doc), label: entry.label });
    this.doc = entry.doc;
    this.pruneSelection();
    this.lastCoalesce = null;
    this.scheduleSave();
    this.emit('undo');
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push({ doc: clone(this.doc), label: entry.label });
    this.doc = entry.doc;
    this.pruneSelection();
    this.lastCoalesce = null;
    this.scheduleSave();
    this.emit('redo');
  }

  setPrefs(p: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...p };
    if (this.persist) savePrefs(this.prefs);
    this.emit('prefs');
  }

  private rememberDoc(doc: Diagram): void {
    this.prefs.lastDocId = doc.id;
    if (this.persist) savePrefs(this.prefs);
  }

  select(nodes: string[] = [], edges: string[] = [], additive = false): void {
    if (!additive) this.selection = { nodes: new Set(), edges: new Set() };
    for (const id of nodes) this.selection.nodes.add(id);
    for (const id of edges) this.selection.edges.add(id);
    this.emit('selection');
  }

  toggleSelect(nodeId?: string, edgeId?: string): void {
    if (nodeId) {
      if (this.selection.nodes.has(nodeId)) this.selection.nodes.delete(nodeId);
      else this.selection.nodes.add(nodeId);
    }
    if (edgeId) {
      if (this.selection.edges.has(edgeId)) this.selection.edges.delete(edgeId);
      else this.selection.edges.add(edgeId);
    }
    this.emit('selection');
  }

  clearSelection(): void {
    if (!this.selection.nodes.size && !this.selection.edges.size) return;
    this.selection = { nodes: new Set(), edges: new Set() };
    this.emit('selection');
  }

  selectedNodes() {
    return this.doc.nodes.filter((n) => this.selection.nodes.has(n.id));
  }
  selectedEdges() {
    return this.doc.edges.filter((e) => this.selection.edges.has(e.id));
  }

  private pruneSelection(): void {
    const nodeIds = new Set(this.doc.nodes.map((n) => n.id));
    const edgeIds = new Set(this.doc.edges.map((e) => e.id));
    this.selection = {
      nodes: new Set([...this.selection.nodes].filter((id) => nodeIds.has(id))),
      edges: new Set([...this.selection.edges].filter((id) => edgeIds.has(id))),
    };
  }

  private scheduleSave(): void {
    if (!this.persist) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 350);
  }

  /** Persist immediately; safe to call often. */
  flush(): void {
    if (!this.persist) return;
    window.clearTimeout(this.saveTimer);
    const ok = saveDoc(this.doc);
    if (!ok && !this.saveFailed) {
      this.saveFailed = true;
      this.emit('save-error');
    } else if (ok) {
      this.saveFailed = false;
    }
  }

  hasSaveError(): boolean {
    return this.saveFailed;
  }
}
