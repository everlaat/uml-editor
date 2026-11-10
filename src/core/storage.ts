import { SCHEMA_VERSION, normalizeDiagram, type Diagram } from './model';

const INDEX_KEY = 'umlx.index.v1';
const DOC_KEY = (id: string) => `umlx.doc.v1.${id}`;
const PREFS_KEY = 'umlx.prefs.v1';

export interface DocSummary {
  id: string;
  name: string;
  updatedAt: number;
  nodeCount: number;
}

export interface Prefs {
  theme: 'light' | 'dark';
  lastDocId?: string;
  grid: boolean;
  snap: boolean;
  route: 'orthogonal' | 'straight' | 'curved';
  codePanel: boolean;
  llmModel?: string;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  grid: true,
  snap: true,
  route: 'orthogonal',
  codePanel: true,
};

/** localStorage can throw (Safari private mode, quota). Never let that break the editor. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs {
  const raw = safeGet(PREFS_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  safeSet(PREFS_KEY, JSON.stringify(p));
}

export function listDocs(): DocSummary[] {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DocSummary[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: DocSummary[]): void {
  safeSet(INDEX_KEY, JSON.stringify(list));
}

export function loadDoc(id: string): Diagram | null {
  const raw = safeGet(DOC_KEY(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; doc?: unknown };
    return normalizeDiagram(parsed.doc ?? parsed);
  } catch {
    return null;
  }
}

export function saveDoc(doc: Diagram): boolean {
  const ok = safeSet(DOC_KEY(doc.id), JSON.stringify({ version: SCHEMA_VERSION, doc }));
  const list = listDocs().filter((d) => d.id !== doc.id);
  list.unshift({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length });
  writeIndex(list);
  return ok;
}

export function deleteDoc(id: string): void {
  safeRemove(DOC_KEY(id));
  writeIndex(listDocs().filter((d) => d.id !== id));
}

/** Rough byte size of everything we own, for the storage meter in the UI. */
export function storageUsage(): { bytes: number; docs: number } {
  let bytes = 0;
  let docs = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('umlx.')) continue;
      bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
      if (key.startsWith('umlx.doc.')) docs++;
    }
  } catch {
    /* ignore */
  }
  return { bytes: bytes * 2, docs }; // UTF-16 code units
}
