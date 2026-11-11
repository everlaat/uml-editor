/** Entry point for the Node test bundle: pure logic only, no DOM. */
export { parseMermaid, normalizeLinkLabels, parseNodeSpec, decodeLabel } from './mermaid/parse';
export { toMermaid, mermaidIds } from './mermaid/serialize';
export { generateFromPrompt, shapeForLabel } from './ai/heuristic';
export { layoutDiagram, resolveOverlaps, adjustRoutes, waypointsValid, refreshRouteAnchors } from './core/layout';
export { routeEdge, squareUp, parallelOffsets } from './render/route';
export { extractMermaid } from './ai/generate';
export { planResize, isImageFile, IMAGE_INSTRUCTION, repairInstruction, MAX_IMAGE_SIDE } from './ai/vision';
export { normalizeDiagram, emptyDiagram, makeNode, makeEdge } from './core/model';
export { wrapText, measureLabel, measureStyled } from './render/text';
export { resolveText, FONT_STACKS, clampSize, DEFAULT_TEXT } from './render/typography';
export { allShapes, shapeDef, shapesByCategory, registerShape, hasShape, geometryOf, defaultSizeOf, CATEGORY_ORDER } from './shapes/registry';
export { parsePath, serializePath, scaleUnitPath, fitPathToUnitBox, pathBounds, isValidPath, PathError } from './shapes/path';
export { mermaidFidelity, isLossless } from './mermaid/fidelity';
export { mergeIncoming } from './core/merge';
export { isExpressibleInMermaid } from './mermaid/serialize';
export { fitNodeSize, shapeGeometry } from './render/shapes';
