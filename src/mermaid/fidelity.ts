import type { Diagram, DiagramNode } from '../core/model';
import { shapeDef } from '../shapes/registry';
import { canonicalShapeFor } from './parse';
import { isExpressibleInMermaid } from './serialize';

export type FidelityKind = 'element' | 'text-style' | 'colour' | 'edge-route' | 'geometry';

export interface FidelityIssue {
  kind: FidelityKind;
  /** One line, written for the person looking at the Mermaid panel. */
  message: string;
  /** Node or edge ids this concerns, for highlighting later. */
  ids: string[];
}

/**
 * What a Mermaid export would lose. Mermaid describes structure — which boxes
 * exist and how they connect — so anything about appearance or placement is
 * outside it. The editor reports that rather than pretending otherwise, and
 * the JSON export remains the lossless format.
 */
export function mermaidFidelity(doc: Diagram): FidelityIssue[] {
  const issues: FidelityIssue[] = [];

  const unsupported = doc.nodes.filter((n) => !isExpressibleInMermaid(n));
  if (unsupported.length) {
    issues.push({
      kind: 'element',
      message: `${describeNodes(unsupported)} ${unsupported.length === 1 ? 'has' : 'have'} no Mermaid equivalent and ${unsupported.length === 1 ? 'is' : 'are'} left out. ${unsupported.length === 1 ? 'It stays' : 'They stay'} on the canvas when you edit the code.`,
      ids: unsupported.map((n) => n.id),
    });
  }

  const dropped = new Set(unsupported.map((n) => n.id));
  const strandedEdges = doc.edges.filter((e) => dropped.has(e.from) || dropped.has(e.to));
  if (strandedEdges.length) {
    issues.push({
      kind: 'element',
      message: `${strandedEdges.length} connection${strandedEdges.length === 1 ? '' : 's'} to those elements cannot be written either.`,
      ids: strandedEdges.map((e) => e.id),
    });
  }

  const styledNodes = doc.nodes.filter((n) => n.text && Object.keys(n.text).length);
  const styledEdges = doc.edges.filter((e) => e.text && Object.keys(e.text).length);
  if (styledNodes.length || styledEdges.length) {
    issues.push({
      kind: 'text-style',
      message: `Fonts, sizes and alignment on ${styledNodes.length + styledEdges.length} label${styledNodes.length + styledEdges.length === 1 ? '' : 's'} are not part of Mermaid.`,
      ids: [...styledNodes.map((n) => n.id), ...styledEdges.map((e) => e.id)],
    });
  }

  // A shape whose bracket pair reads back as something else survives the
  // export but not the re-import.
  const approximated = doc.nodes.filter((n) => {
    if (!isExpressibleInMermaid(n)) return false;
    const def = shapeDef(n.shape);
    return !!def.mermaid && canonicalShapeFor(def.mermaid.open, def.mermaid.close) !== def.id;
  });
  if (approximated.length) {
    issues.push({
      kind: 'element',
      message: `${describeNodes(approximated)} ${approximated.length === 1 ? 'is' : 'are'} written as the nearest Mermaid shape, so reading the code back changes ${approximated.length === 1 ? 'it' : 'them'}.`,
      ids: approximated.map((n) => n.id),
    });
  }

  const routed = doc.edges.filter((e) => e.route || e.waypoints?.length);
  if (routed.length) {
    issues.push({
      kind: 'edge-route',
      message: 'Edge routing and hand positioning are recalculated by whatever renders the Mermaid.',
      ids: routed.map((e) => e.id),
    });
  }

  return issues;
}

function describeNodes(nodes: DiagramNode[]): string {
  const names = [...new Set(nodes.map((n) => shapeDef(n.shape).name.toLowerCase()))];
  const listed = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` and ${names.length - 3} more` : '';
  const count = nodes.length;
  return `${count} element${count === 1 ? '' : 's'} (${listed}${more})`;
}

/** True when the document is fully describable as Mermaid. */
export function isLossless(doc: Diagram): boolean {
  return mermaidFidelity(doc).length === 0;
}
