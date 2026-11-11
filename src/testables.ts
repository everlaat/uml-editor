/** Entry point for the Node test bundle: pure logic only, no DOM. */
export { parseMermaid, normalizeLinkLabels, parseNodeSpec, decodeLabel } from './mermaid/parse';
export { toMermaid, mermaidIds } from './mermaid/serialize';
export { generateFromPrompt, shapeForLabel } from './ai/heuristic';
export { layoutDiagram, resolveOverlaps, adjustRoutes, waypointsValid, refreshRouteAnchors } from './core/layout';
export { routeEdge, squareUp, parallelOffsets } from './render/route';
export { extractMermaid } from './ai/generate';
export { normalizeDiagram, emptyDiagram, makeNode, makeEdge } from './core/model';
export { wrapText, measureLabel } from './render/text';
