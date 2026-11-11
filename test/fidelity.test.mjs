import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMermaid,
  toMermaid,
  mermaidFidelity,
  isLossless,
  isExpressibleInMermaid,
  mergeIncoming,
  makeNode,
  makeEdge,
  emptyDiagram,
  normalizeDiagram,
} from './.build/testables.mjs';

const flow = (code) => {
  const { diagram, errors } = parseMermaid(code);
  assert.deepEqual(errors, []);
  return diagram;
};

test('a plain flowchart reports no loss', () => {
  const doc = flow(`flowchart TD
    a["One"] --> b{"Two?"}
    b -->|Yes| c(["Done"])`);
  assert.deepEqual(mermaidFidelity(doc), []);
  assert.equal(isLossless(doc), true);
});

test('free text and annotations are reported, not silently dropped', () => {
  const doc = flow('flowchart TD\n  a["One"] --> b["Two"]');
  doc.nodes.push(makeNode({ x: 400, y: 0, shape: 'text', label: 'A note to the reader' }));
  doc.nodes.push(makeNode({ x: 400, y: 80, shape: 'heading', label: 'Phase one' }));

  assert.equal(isExpressibleInMermaid(doc.nodes[0]), true);
  assert.equal(isExpressibleInMermaid(doc.nodes[2]), false);

  const issues = mermaidFidelity(doc);
  assert.ok(issues.length >= 1);
  assert.match(issues[0].message, /no Mermaid equivalent/);
  assert.equal(issues[0].ids.length, 2);

  // and the export leaves them out rather than inventing boxes
  const code = toMermaid(doc);
  assert.ok(!code.includes('A note to the reader'), 'free text must not be exported as a box');
  assert.ok(code.includes('One') && code.includes('Two'));
});

test('text styling is reported as something Mermaid cannot carry', () => {
  const doc = flow('flowchart TD\n  a["One"] --> b["Two"]');
  doc.nodes[0].text = { font: 'serif', size: 22, bold: true };
  const issues = mermaidFidelity(doc);
  assert.ok(issues.some((i) => i.kind === 'text-style'), JSON.stringify(issues));
});

test('shapes without an exact Mermaid form are flagged as approximations', () => {
  const doc = flow('flowchart TD\n  a["One"] --> b["Two"]');
  doc.nodes[0].shape = 'document';
  const issues = mermaidFidelity(doc);
  assert.ok(issues.some((i) => /nearest Mermaid shape/.test(i.message)), JSON.stringify(issues));
});

test('connections to an unexportable element are reported too', () => {
  const doc = flow('flowchart TD\n  a["One"] --> b["Two"]');
  const note = makeNode({ x: 400, y: 0, shape: 'text', label: 'Why this exists' });
  doc.nodes.push(note);
  doc.edges.push(makeEdge(doc.nodes[0].id, note.id));
  const issues = mermaidFidelity(doc);
  assert.ok(issues.some((i) => /connection/.test(i.message)), JSON.stringify(issues));
  assert.ok(!toMermaid(doc).includes(note.id));
});

// --------------------------------------------------- applying code safely

function withAnnotations() {
  const current = flow(`flowchart TD
    a["Collect"] --> b["Validate"]
    b --> c["Store"]`);
  current.nodes.forEach((n, i) => {
    n.x = 100;
    n.y = 100 * (i + 1);
  });
  current.nodes[0].text = { font: 'mono', size: 18 };
  const text = makeNode({ x: 500, y: 60, shape: 'text', label: 'Owned by the data team' });
  const heading = makeNode({ x: 500, y: 10, shape: 'heading', label: 'Ingest' });
  current.nodes.push(text, heading);
  current.edges.push(makeEdge(current.nodes[1].id, text.id));
  return { current, textId: text.id, headingId: heading.id };
}

test('editing the Mermaid keeps the elements Mermaid never saw', () => {
  const { current, textId, headingId } = withAnnotations();
  const next = flow(`flowchart TD
    a["Collect"] --> b["Validate"]
    b --> c["Store"]
    c --> d["Report"]`);

  const report = mergeIncoming(current, next, { preservePositions: true, preserveCanvasOnly: true });

  assert.equal(report.carried, 2, 'the free text and heading must survive');
  assert.ok(next.nodes.some((n) => n.id === textId));
  assert.ok(next.nodes.some((n) => n.id === headingId));
  assert.ok(next.nodes.some((n) => n.label === 'Report'), 'the new step still arrives');
  // the connection between a kept box and the free text survives as well
  assert.ok(next.edges.some((e) => e.to === textId));
});

test('a kept element keeps its type settings and position', () => {
  const { current } = withAnnotations();
  const next = flow(`flowchart TD
    a["Collect"] --> b["Validate"]`);
  mergeIncoming(current, next, { preservePositions: true, preserveCanvasOnly: true });
  const collect = next.nodes.find((n) => n.label === 'Collect');
  assert.deepEqual(collect.text, { font: 'mono', size: 18 });
  assert.equal(collect.x, 100);
  assert.equal(collect.y, 100);
});

test('a connection is dropped when the box it pointed at is gone', () => {
  const { current, textId } = withAnnotations();
  // The code no longer mentions "Validate", so the edge to the note cannot stay.
  const next = flow('flowchart TD\n  a["Collect"] --> c["Store"]');
  mergeIncoming(current, next, { preservePositions: true, preserveCanvasOnly: true });
  assert.ok(next.nodes.some((n) => n.id === textId), 'the note itself still survives');
  assert.equal(next.edges.filter((e) => e.to === textId).length, 0);
});

test('without the flag a merge replaces outright', () => {
  const { current } = withAnnotations();
  const next = flow('flowchart TD\n  a["Collect"] --> b["Validate"]');
  const report = mergeIncoming(current, next, { preservePositions: true });
  assert.equal(report.carried, 0);
  assert.equal(next.nodes.length, 2);
});

test('custom shapes round-trip through the document format', () => {
  const doc = emptyDiagram('Custom');
  doc.nodes.push(
    makeNode({ x: 0, y: 0, shape: 'custom:abc123', label: 'Cloud', customPath: 'M 0 0 H 1 V 1 H 0 Z' }),
  );
  const restored = normalizeDiagram(JSON.parse(JSON.stringify(doc)));
  assert.equal(restored.nodes[0].shape, 'custom:abc123', 'an unknown shape id is kept, not rewritten');
  assert.equal(restored.nodes[0].customPath, 'M 0 0 H 1 V 1 H 0 Z', 'the drawing travels with the document');
  assert.equal(isExpressibleInMermaid(restored.nodes[0]), false);
});
