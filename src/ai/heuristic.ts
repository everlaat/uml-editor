import { layoutDiagram, resolveOverlaps } from '../core/layout';
import { emptyDiagram, makeEdge, makeNode, type Diagram, type DiagramNode, type NodeShape } from '../core/model';
import { fitNodeSize } from '../render/shapes';

/**
 * Offline prompt -> diagram translation. No model, no download: a clause parser
 * plus a handful of flowchart conventions. It is the default generator and the
 * fallback when a local model produces something unparseable.
 */
export function generateFromPrompt(prompt: string): Diagram {
  const text = prompt.trim();
  if (!text) return emptyDiagram('Empty');
  if (looksLikeClassPrompt(text)) return buildClassDiagram(text);
  const edgeList = parseEdgeList(text);
  if (edgeList) return finish(edgeList);
  return finish(buildFlow(text));
}

function finish(doc: Diagram): Diagram {
  for (const n of doc.nodes) {
    const fit = fitNodeSize(n);
    n.w = fit.w;
    n.h = fit.h;
  }
  layoutDiagram(doc, { direction: doc.direction });
  resolveOverlaps(doc);
  return doc;
}

// ------------------------------------------------------------- edge-list mode

const ARROW = /\s*(?:-+>|=+>|→|->>|:->)\s*/;

/** "Login -> Validate -> Dashboard" or one edge per line, optional `: label`. */
function parseEdgeList(text: string): Diagram | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const arrowLines = lines.filter((l) => ARROW.test(l));
  if (!arrowLines.length) return null;
  if (arrowLines.length < lines.length / 2) return null;

  const doc = emptyDiagram('Flow');
  const byLabel = new Map<string, DiagramNode>();
  const ensure = (label: string): DiagramNode => {
    const key = label.toLowerCase();
    let node = byLabel.get(key);
    if (!node) {
      node = makeNode({ x: 0, y: 0, label: clean(label), shape: shapeForLabel(label) });
      byLabel.set(key, node);
      doc.nodes.push(node);
    }
    return node;
  };

  for (const line of arrowLines) {
    const [chainPart, ...labelParts] = splitEdgeLabel(line);
    const chain = chainPart.split(ARROW).map((p) => p.trim()).filter(Boolean);
    const edgeLabel = labelParts.join(':').trim();
    for (let i = 1; i < chain.length; i++) {
      const a = ensure(chain[i - 1]);
      const b = ensure(chain[i]);
      doc.edges.push(makeEdge(a.id, b.id, { label: edgeLabel || undefined }));
    }
  }
  for (const line of lines.filter((l) => !ARROW.test(l))) {
    if (/^[-*\d.)\s]*$/.test(line)) continue;
    ensure(line.replace(/^[-*\d.)\s]+/, ''));
  }
  return doc.nodes.length ? doc : null;
}

function splitEdgeLabel(line: string): string[] {
  // Split on the last ':' that is not part of an arrow.
  const idx = line.lastIndexOf(':');
  if (idx === -1 || idx < line.search(ARROW)) return [line];
  return [line.slice(0, idx), line.slice(idx + 1)];
}

// ----------------------------------------------------------------- flow mode

interface Open {
  id: string;
  label?: string;
}

const STEP_PREFIX = /^\s*(?:[-*•]|\(?\d+[.)])\s+/;
const CONNECTIVES =
  /^(?:and\s+)?(?:then|next|after\s+that|afterwards|finally|first(?:ly)?|second(?:ly)?|third(?:ly)?|lastly|subsequently|also|now)\b[,:]?\s*/i;
const DECISION_RE =
  /^(?:if|when|whether|check\s+(?:if|whether)|is|are|does|do|has|have|can|should|was|were)\b/i;
const END_RE = /^(?:end|done|finish|finished|complete|completed|stop|exit|terminate)\b/i;
const START_RE = /^(?:start|begin|begins|entry|user\s+(?:opens|visits|arrives))\b/i;
const LOOP_RE = /^(?:repeat|retry|while|until|loop|for\s+each|for\s+every|foreach)\b/i;
const BACK_RE = /\b(?:go\s+back\s+to|back\s+to|return\s+to|retry\s+from|loop\s+back\s+to)\s+(.+)$/i;

function buildFlow(text: string): Diagram {
  const doc = emptyDiagram(titleFromPrompt(text));
  const clauses = splitClauses(text);
  if (!clauses.length) return doc;

  const nodeIndex = new Map<string, string>(); // lowercase label -> node id
  const add = (label: string, shape: NodeShape): DiagramNode => {
    const node = makeNode({ x: 0, y: 0, label: clean(label), shape });
    doc.nodes.push(node);
    nodeIndex.set(node.label.toLowerCase(), node.id);
    return node;
  };
  const link = (from: Open, to: string) => {
    if (from.id === to) return;
    if (doc.edges.some((e) => e.from === from.id && e.to === to && e.label === from.label)) return;
    doc.edges.push(makeEdge(from.id, to, { label: from.label }));
  };

  const needsTerminals = clauses.length > 1 && !START_RE.test(clauses[0].text);
  let open: Open[] = [];
  if (needsTerminals) {
    const start = add('Start', 'stadium');
    open = [{ id: start.id }];
  }

  // A decision we may still need to attach an "else" branch to.
  let pendingDecision: { id: string; noOpen: boolean; mergeEnds: Open[] } | null = null;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    const raw = clause.text;
    const back = BACK_RE.exec(raw);

    if (/^(?:else|otherwise|if\s+not|on\s+failure|on\s+error)\b/i.test(raw) && pendingDecision) {
      // Close the yes-branch and switch to the no-branch. The decision's own
      // stub is dropped so it cannot sprout a second "No" edge later.
      const decisionId = pendingDecision.id;
      pendingDecision.mergeEnds = open.filter((o) => o.id !== decisionId);
      open = [{ id: decisionId, label: 'No' }];
      pendingDecision.noOpen = false;
      const rest = raw.replace(/^(?:else|otherwise|if\s+not|on\s+failure|on\s+error)\b[,:]?\s*/i, '').trim();
      if (!rest) continue;
      const node = add(rest, shapeForLabel(rest));
      for (const o of open) link(o, node.id);
      open = [{ id: node.id }];
      continue;
    }

    if (back) {
      const targetId = findNode(nodeIndex, clean(back[1]));
      if (targetId) {
        // "If the card is declined, notify the customer and go back to checkout"
        // becomes: decision -> action -> dashed edge back, with the other
        // branch left open for whatever the description says next.
        const head = raw.slice(0, back.index).trim().replace(/\s+and$/i, '').replace(/[,:]$/, '');
        let condition = '';
        let action = '';
        if (/^(?:if|when|whether)\b/i.test(head)) {
          const m = /^(?:if|when|whether)\s+(.+?)(?:,\s*|\s+then\s+)(.+?)(?:\s+and)?$/i.exec(head);
          if (m) {
            condition = m[1];
            action = m[2];
          } else condition = head.replace(/^(?:if|when|whether)\s+/i, '');
        } else {
          action = head;
        }

        let branch: Open[] = open;
        if (condition) {
          const decision = add(conditionText(condition), 'diamond');
          for (const o of open) link(o, decision.id);
          branch = [{ id: decision.id, label: 'Yes' }];
          open = [{ id: decision.id, label: 'No' }];
          pendingDecision = { id: decision.id, noOpen: true, mergeEnds: [] };
        } else {
          open = [];
        }
        if (action) {
          const node = add(action, shapeForLabel(action));
          for (const o of branch) link(o, node.id);
          branch = [{ id: node.id }];
        }
        for (const o of branch) {
          doc.edges.push(makeEdge(o.id, targetId, { label: o.label, line: 'dashed' }));
        }
        continue;
      }
    }

    if (END_RE.test(raw)) {
      const node = add(stripLeading(raw) || 'End', 'stadium');
      for (const o of open) link(o, node.id);
      open = [{ id: node.id }];
      continue;
    }

    const inline = splitInlineBranch(raw);
    if (inline) {
      const decision = add(conditionText(inline.condition), 'diamond');
      for (const o of open) link(o, decision.id);
      const yes = add(inline.then, shapeForLabel(inline.then));
      doc.edges.push(makeEdge(decision.id, yes.id, { label: inline.yesLabel }));
      if (inline.otherwise) {
        const no = add(inline.otherwise, shapeForLabel(inline.otherwise));
        doc.edges.push(makeEdge(decision.id, no.id, { label: inline.noLabel }));
        open = [{ id: yes.id }, { id: no.id }];
        pendingDecision = null;
      } else {
        // Leave the No branch open so a following "otherwise…" clause attaches to it.
        open = [{ id: yes.id }];
        pendingDecision = { id: decision.id, noOpen: true, mergeEnds: [] };
      }
      continue;
    }

    if (LOOP_RE.test(raw)) {
      const body = stripLeading(raw);
      const decision = add(conditionText(body), 'diamond');
      for (const o of open) link(o, decision.id);
      const next = clauses[i + 1];
      if (next) {
        const bodyNode = add(next.text, shapeForLabel(next.text));
        doc.edges.push(makeEdge(decision.id, bodyNode.id, { label: 'Yes' }));
        doc.edges.push(makeEdge(bodyNode.id, decision.id, { line: 'dashed' }));
        i++;
      }
      open = [{ id: decision.id, label: 'No' }];
      pendingDecision = null;
      continue;
    }

    if (DECISION_RE.test(raw) || raw.trim().endsWith('?')) {
      const decision = add(conditionText(raw), 'diamond');
      for (const o of open) link(o, decision.id);
      open = [{ id: decision.id, label: 'Yes' }];
      pendingDecision = { id: decision.id, noOpen: true, mergeEnds: [] };
      continue;
    }

    const label = stripLeading(raw);
    if (!label) continue;
    const existing = findNode(nodeIndex, clean(label));
    const node = existing
      ? doc.nodes.find((n) => n.id === existing)!
      : add(label, shapeForLabel(label));
    for (const o of open) link(o, node.id);
    open = [{ id: node.id }];
    if (pendingDecision && pendingDecision.noOpen) {
      // Leave the decision's No branch dangling until an else/end appears.
    }
  }

  // Any decision that never got an else branch gets one to the end.
  const terminalEnds = [...open];
  if (pendingDecision?.noOpen) terminalEnds.push({ id: pendingDecision.id, label: 'No' });
  if (pendingDecision?.mergeEnds.length) terminalEnds.push(...pendingDecision.mergeEnds);

  if (needsTerminals && terminalEnds.length) {
    const end = add('End', 'stadium');
    for (const o of dedupeOpen(terminalEnds)) link(o, end.id);
  }
  return doc;
}

function dedupeOpen(list: Open[]): Open[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const key = `${o.id}|${o.label ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolve "go back to sign in" against existing node labels. Exact first, then
 * a token-overlap match so plurals and filler words do not block it.
 */
function findNode(index: Map<string, string>, label: string): string | undefined {
  const key = label.toLowerCase().replace(/[.?!]$/, '');
  if (index.has(key)) return index.get(key);
  const bare = (s: string) => s.replace(/^the\s+/, '').replace(/[.?!]$/, '');
  for (const [k, v] of index) {
    if (bare(k) === bare(key)) return v;
  }
  const target = tokenize(key);
  if (!target.length) return undefined;
  let best: { id: string; score: number } | null = null;
  for (const [k, v] of index) {
    const tokens = tokenize(k);
    if (!tokens.length) continue;
    const shared = target.filter((t) => tokens.includes(t)).length;
    const score = shared / target.length;
    const enough = target.length === 1 ? shared === 1 && tokens.length <= 3 : score >= 0.75;
    if (enough && (!best || score > best.score)) best = { id: v, score };
  }
  return best?.id;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'it', 'its', 'their', 'this', 'that']);

/** Lowercase words, minus filler, with a crude plural/verb-ending trim. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(?:ies|es|s|ing|ed)$/, '') : w));
}

/** Split a prompt into ordered clauses: lines first, then sentences, then "then"-chains. */
function splitClauses(text: string): { text: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const stepLines = lines.filter((l) => STEP_PREFIX.test(l));
  const source =
    stepLines.length >= 2 ? lines.map((l) => l.replace(STEP_PREFIX, '')) : splitSentences(lines.join(' '));

  const out: { text: string }[] = [];
  for (const piece of source) {
    for (const part of splitChain(piece)) {
      const t = part.trim().replace(/[.;]+$/, '').trim();
      if (t) out.push({ text: t });
    }
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+(?=[A-Z0-9"'(])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Breaks "do a, then do b and then do c" without breaking "if a, do b". */
function splitChain(sentence: string): string[] {
  const parts: string[] = [];
  let buf = '';
  const tokens = sentence.split(/(\bthen\b|\bafter that\b|\bnext\b|\bfinally\b|\bafterwards\b|,|;)/i);
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    if (/^(?:then|after that|next|finally|afterwards)$/i.test(t)) {
      if (buf.trim()) parts.push(buf);
      buf = '';
      continue;
    }
    if (t === ',' || t === ';') {
      // A comma only breaks a clause when what follows starts a new action.
      if (buf.trim() && /\b(?:then|and)\b\s*$/i.test(buf)) {
        parts.push(buf);
        buf = '';
      } else buf += ', ';
      continue;
    }
    buf += (buf && !buf.endsWith(' ') ? ' ' : '') + t;
  }
  if (buf.trim()) parts.push(buf);
  return parts.length ? parts : [sentence];
}

interface InlineBranch {
  condition: string;
  then: string;
  otherwise?: string;
  yesLabel: string;
  noLabel: string;
}

/** Matches "if X then Y else Z" / "if X, Y, otherwise Z" inside one clause. */
function splitInlineBranch(clause: string): InlineBranch | null {
  const m = /^(?:if|when|whether)\s+(.+)$/i.exec(clause.trim());
  if (!m) return null;
  let rest = m[1];
  let otherwise: string | undefined;
  const elseMatch = /\s(?:else|otherwise)\s+(.+)$/i.exec(rest);
  if (elseMatch) {
    otherwise = elseMatch[1].trim();
    rest = rest.slice(0, elseMatch.index);
  }
  const thenMatch = /^(.+?)(?:\s+then\s+|,\s*)(.+)$/i.exec(rest);
  if (!thenMatch) return null;
  const condition = thenMatch[1].trim();
  const action = thenMatch[2].trim();
  if (!condition || !action) return null;
  const negative = /\b(?:not|invalid|fails?|failed|missing|error)\b/i.test(condition);
  return {
    condition,
    then: action,
    otherwise,
    yesLabel: negative ? 'Yes' : 'Yes',
    noLabel: 'No',
  };
}

function conditionText(raw: string): string {
  const body = raw
    .replace(/^(?:if|when|whether|check\s+(?:if|whether)?|verify|validate|decide\s+(?:if|whether)?)\s*/i, '')
    .replace(/^(?:repeat|retry|while|until|loop|for\s+each|for\s+every|foreach)\s*/i, '')
    .replace(/[,.]$/, '')
    .trim();
  const text = clean(body);
  return text.endsWith('?') ? text : `${text}?`;
}

function stripLeading(raw: string): string {
  return raw.replace(CONNECTIVES, '').replace(/^(?:the\s+system\s+|it\s+)/i, '').trim();
}

const DATA_RE = /\b(?:database|db|datastore|store[sd]?|save[sd]?|persist|record[sd]?|table|cache|queue|bucket|s3)\b/i;
const INPUT_RE = /\b(?:input|enter[sd]?|upload[sd]?|submit[sd]?|request[sd]?|receive[sd]?|form|scan[sd]?)\b/i;
const OUTPUT_RE = /\b(?:send[sd]?|notify|notifies|email[sd]?|report|print[sd]?|display[sd]?|render[sd]?|respond[sd]?|return[sd]?)\b/i;
const SERVICE_RE = /\b(?:service|api|worker|lambda|microservice|endpoint|handler)\b/i;

export function shapeForLabel(label: string): NodeShape {
  const t = label.toLowerCase();
  if (START_RE.test(t) || END_RE.test(t)) return 'stadium';
  if (t.trim().endsWith('?')) return 'diamond';
  if (DATA_RE.test(t)) return 'cylinder';
  if (INPUT_RE.test(t)) return 'parallelogram';
  if (OUTPUT_RE.test(t)) return 'parallelogram-alt';
  if (SERVICE_RE.test(t)) return 'subroutine';
  return 'rect';
}

function clean(label: string): string {
  const trimmed = label
    .trim()
    .replace(/^[-*•\s]+/, '')
    .replace(/[,;:]+$/, '')
    .replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function titleFromPrompt(text: string): string {
  const first = text.split(/[\n.!?]/)[0]?.trim() ?? 'Flow';
  const words = first.split(/\s+/).slice(0, 6).join(' ');
  return words.length > 3 ? clean(words) : 'Flow';
}

// ----------------------------------------------------------- class diagrams

function looksLikeClassPrompt(text: string): boolean {
  const t = text.toLowerCase();
  const hits = [
    /\bclass(es)?\b/,
    /\binherits?\b/,
    /\bextends\b/,
    /\bsubclass\b/,
    /\bimplements\b/,
    /\bhas\s+many\b/,
    /\bbelongs?\s+to\b/,
    /\buml\s+class\b/,
    /\bentit(y|ies)\b/,
    /\bdata\s+model\b/,
  ].filter((re) => re.test(t)).length;
  return hits >= 1 && !/\bflow(chart)?\b/.test(t);
}

const RELATIONS: { re: RegExp; start: 'none' | 'triangle' | 'diamond' | 'odiamond'; end: 'none' | 'open' | 'triangle'; label?: string; reverse?: boolean }[] = [
  { re: /\b(?:extends|inherits\s+from|is\s+a\s+kind\s+of|is\s+an?|subclasses)\b/i, start: 'none', end: 'triangle' },
  { re: /\bimplements\b/i, start: 'none', end: 'triangle' },
  { re: /\bhas\s+many\b/i, start: 'none', end: 'open', label: '1..*' },
  { re: /\bhas\s+one\b/i, start: 'none', end: 'open', label: '1' },
  { re: /\b(?:contains|composed\s+of|owns)\b/i, start: 'diamond', end: 'none' },
  { re: /\b(?:aggregates|groups)\b/i, start: 'odiamond', end: 'none' },
  { re: /\b(?:belongs\s+to|references|uses|depends\s+on|has|have)\b/i, start: 'none', end: 'open' },
];

function buildClassDiagram(text: string): Diagram {
  const doc = emptyDiagram('Class diagram');
  doc.kind = 'class';
  const byName = new Map<string, DiagramNode>();
  const ensure = (name: string): DiagramNode => {
    const clean0 = toClassName(name);
    const key = clean0.toLowerCase();
    let node = byName.get(key);
    if (!node) {
      node = makeNode({ x: 0, y: 0, label: clean0, shape: 'class', attributes: [], methods: [] });
      byName.set(key, node);
      doc.nodes.push(node);
    }
    return node;
  };

  for (const sentence of splitSentences(text.replace(/^[^:]*:\s*/, ''))) {
    const clause = sentence.replace(/^(?:a|an|the|also|and)\s+/i, '').trim();
    if (!clause) continue;

    // "Order has fields id, total, status"
    const fields = /^(.+?)\s+(?:has|with|contains)\s+(?:fields?|attributes?|properties|columns)\s+(.+)$/i.exec(clause);
    if (fields) {
      const node = ensure(fields[1]);
      for (const raw of fields[2].split(/,|\band\b/)) {
        const name = raw.trim().replace(/[.;]$/, '');
        if (name) node.attributes!.push(`+${toFieldName(name)}`);
      }
      continue;
    }

    // "User can login, logout" -> methods
    const methods = /^(.+?)\s+(?:can|should\s+be\s+able\s+to|exposes|provides)\s+(.+)$/i.exec(clause);
    if (methods) {
      const node = ensure(methods[1]);
      for (const raw of methods[2].split(/,|\band\b/)) {
        const name = raw.trim().replace(/[.;]$/, '');
        if (name) node.methods!.push(`+${toMethodName(name)}()`);
      }
      continue;
    }

    const rel = RELATIONS.find((r) => r.re.test(clause));
    if (rel) {
      const m = clause.split(rel.re);
      const left = m[0]?.trim();
      const right = m[m.length - 1]?.trim();
      if (left && right) {
        const a = ensure(left);
        const b = ensure(stripArticles(right));
        doc.edges.push(
          makeEdge(a.id, b.id, {
            startArrow: rel.start,
            endArrow: rel.end,
            label: rel.label,
          }),
        );
        continue;
      }
    }

    // Bare list of classes: "classes: User, Order, Product"
    const list = clause.replace(/^(?:classes?|entities|models?)\s*[:\-]?\s*/i, '');
    if (list !== clause || /^[A-Z][\w\s,]+$/.test(clause)) {
      for (const name of list.split(/,|\band\b/)) {
        const n = name.trim().replace(/[.;]$/, '');
        if (n) ensure(n);
      }
    }
  }
  if (!doc.nodes.length) return finish(buildFlow(text));
  return finish(doc);
}

function stripArticles(s: string): string {
  return s.replace(/^(?:a|an|the|its|their)\s+/i, '').replace(/[.;]$/, '').trim();
}

function toClassName(raw: string): string {
  const base = stripArticles(raw)
    .replace(/\b(?:class|entity|model|table)\b/gi, '')
    .replace(/[^A-Za-z0-9\s_]/g, ' ')
    .trim();
  const words = base.split(/\s+/).filter(Boolean).slice(0, 3);
  if (!words.length) return 'Class';
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

function toFieldName(raw: string): string {
  const parts = raw.replace(/[^A-Za-z0-9\s_]/g, ' ').trim().split(/\s+/);
  if (!parts.length) return 'field';
  return parts.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
}

function toMethodName(raw: string): string {
  return toFieldName(raw);
}
