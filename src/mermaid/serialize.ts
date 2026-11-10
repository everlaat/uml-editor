import type { ArrowHead, Diagram, DiagramEdge, DiagramNode, EdgeLine, NodeShape } from '../core/model';

const WRAPPERS: Record<NodeShape, [string, string]> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  subroutine: ['[[', ']]'],
  cylinder: ['[(', ')]'],
  circle: ['((', '))'],
  diamond: ['{', '}'],
  hexagon: ['{{', '}}'],
  parallelogram: ['[/', '/]'],
  'parallelogram-alt': ['[\\', '\\]'],
  trapezoid: ['[/', '\\]'],
  'trapezoid-alt': ['[\\', '/]'],
  class: ['[', ']'],
  actor: ['([', '])'],
  note: ['[', ']'],
};

/** Diagram -> Mermaid source. Round-trips through `parseMermaid`. */
export function toMermaid(doc: Diagram): string {
  return doc.kind === 'class' ? toClassDiagram(doc) : toFlowchart(doc);
}

function toFlowchart(doc: Diagram): string {
  const ids = mermaidIds(doc.nodes);
  const lines: string[] = [`flowchart ${doc.direction}`];
  const grouped = new Map<string, DiagramNode[]>();
  const loose: DiagramNode[] = [];
  for (const n of doc.nodes) {
    if (n.parent && doc.groups.some((g) => g.id === n.parent)) {
      const list = grouped.get(n.parent) ?? [];
      list.push(n);
      grouped.set(n.parent, list);
    } else loose.push(n);
  }

  for (const n of loose) lines.push(`    ${declare(n, ids)}`);
  for (const group of doc.groups) {
    const members = grouped.get(group.id);
    if (!members?.length) continue;
    lines.push(`    subgraph ${sanitizeId(group.id)}["${escapeLabel(group.label)}"]`);
    for (const n of members) lines.push(`        ${declare(n, ids)}`);
    lines.push('    end');
  }
  for (const e of doc.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (!from || !to) continue;
    lines.push(`    ${from} ${linkToken(e)} ${to}`);
  }
  const styled = doc.nodes.filter((n) => n.color);
  for (const n of styled) lines.push(`    style ${ids.get(n.id)} fill:${n.color}`);
  return lines.join('\n');
}

function declare(n: DiagramNode, ids: Map<string, string>): string {
  const id = ids.get(n.id)!;
  const [open, close] = WRAPPERS[n.shape] ?? WRAPPERS.rect;
  const label = escapeLabel(n.label || id);
  return `${id}${open}"${label}"${close}`;
}

function linkToken(e: DiagramEdge): string {
  const base = baseToken(e.line, e.startArrow, e.endArrow);
  return e.label ? `${base}|"${escapeLabel(e.label)}"|` : base;
}

function baseToken(line: EdgeLine, start: ArrowHead, end: ArrowHead): string {
  const head = end === 'none' ? '' : end === 'cross' ? 'x' : end === 'circle' ? 'o' : '>';
  const tail = start === 'none' ? '' : '<';
  if (line === 'thick') return `${tail}${head ? '==' : '==='}${head}`;
  if (line === 'dashed') return `${tail}-.-${head}`;
  return `${tail}${head ? '--' : '---'}${head}`;
}

function toClassDiagram(doc: Diagram): string {
  const ids = mermaidIds(doc.nodes, true);
  const lines: string[] = ['classDiagram'];
  if (doc.direction !== 'TB') lines.push(`    direction ${doc.direction}`);
  for (const n of doc.nodes) {
    const id = ids.get(n.id)!;
    const members = [
      ...(n.stereotype ? [`<<${n.stereotype}>>`] : []),
      ...(n.attributes ?? []),
      ...(n.methods ?? []),
    ];
    if (!members.length) {
      lines.push(`    class ${id}`);
      continue;
    }
    lines.push(`    class ${id} {`);
    for (const m of members) lines.push(`        ${m}`);
    lines.push('    }');
  }
  for (const e of doc.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (!from || !to) continue;
    lines.push(`    ${from} ${classRelationToken(e)} ${to}${e.label ? ` : ${e.label.replace(/\n/g, ' ')}` : ''}`);
  }
  return lines.join('\n');
}

function classRelationToken(e: DiagramEdge): string {
  const dashed = e.line === 'dashed';
  const map: Record<string, string> = {
    'triangle|none': dashed ? '<|..' : '<|--',
    'none|triangle': dashed ? '..|>' : '--|>',
    'diamond|none': '*--',
    'none|diamond': '--*',
    'odiamond|none': 'o--',
    'none|odiamond': '--o',
    'none|open': dashed ? '..>' : '-->',
    'open|none': dashed ? '<..' : '<--',
    'none|arrow': dashed ? '..>' : '-->',
    'arrow|none': dashed ? '<..' : '<--',
    'none|none': dashed ? '..' : '--',
    'open|open': '<-->',
    'arrow|arrow': '<-->',
  };
  return map[`${e.startArrow}|${e.endArrow}`] ?? (dashed ? '..>' : '-->');
}

/** Human-readable, unique, syntax-safe ids derived from labels where possible. */
export function mermaidIds(nodes: DiagramNode[], pascal = false): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const n of nodes) {
    let base = /^[A-Za-z][A-Za-z0-9_]*$/.test(n.id) ? n.id : fromLabel(n.label, pascal);
    if (!base) base = 'N';
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}${i++}`;
    used.add(candidate);
    map.set(n.id, candidate);
  }
  return map;
}

function fromLabel(label: string, pascal: boolean): string {
  const words = label
    .replace(/[^A-Za-z0-9\s_]/g, ' ')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 4);
  if (!words.length) return '';
  const joined = pascal
    ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
    : words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join('');
  const safe = joined.replace(/^[^A-Za-z]+/, '');
  return safe.slice(0, 28) || '';
}

export function sanitizeId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, '');
  return safe || 'g';
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '#quot;').replace(/\n/g, '<br/>');
}
