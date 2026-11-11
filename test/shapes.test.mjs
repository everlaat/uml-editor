import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allShapes,
  shapeDef,
  defaultSizeOf,
  geometryOf,
  hasShape,
  registerShape,
  CATEGORY_ORDER,
  makeNode,
  fitNodeSize,
  parsePath,
  serializePath,
  scaleUnitPath,
  fitPathToUnitBox,
  pathBounds,
  isValidPath,
  resolveText,
  clampSize,
  measureStyled,
} from './.build/testables.mjs';

test('every registered shape is complete and drawable', () => {
  const shapes = allShapes();
  assert.ok(shapes.length >= 30, `expected a decent library, got ${shapes.length}`);
  const seen = new Set();
  for (const def of shapes) {
    assert.ok(def.id && !seen.has(def.id), `duplicate or missing id: ${def.id}`);
    seen.add(def.id);
    assert.ok(def.name && def.name.length > 1, `${def.id} needs a name`);
    assert.ok(CATEGORY_ORDER.includes(def.category), `${def.id} has an unknown category`);
    assert.ok(def.defaultSize.w > 0 && def.defaultSize.h > 0, `${def.id} needs a default size`);
    assert.ok(def.mermaid === null || (def.mermaid.open && def.mermaid.close), `${def.id} has a broken mermaid mapping`);

    const node = makeNode({ x: 0, y: 0, shape: def.id, label: 'Sample label' }, def.defaultSize);
    const geo = geometryOf(node);
    assert.ok(geo.path.startsWith('M'), `${def.id} must draw a path`);
    assert.ok(!/NaN|Infinity|undefined/.test(geo.path), `${def.id} produced a broken path: ${geo.path.slice(0, 80)}`);
    for (const d of geo.decorations ?? []) {
      assert.ok(!/NaN|Infinity|undefined/.test(d), `${def.id} produced a broken decoration`);
    }
    assert.ok(geo.textBox.w > 0 && geo.textBox.h > 0, `${def.id} needs somewhere to put text`);
  }
});

test('shapes size themselves to their text without collapsing', () => {
  for (const def of allShapes()) {
    const node = makeNode({ x: 0, y: 0, shape: def.id, label: 'A reasonably long label here' }, def.defaultSize);
    const fit = fitNodeSize(node);
    assert.ok(fit.w >= 10 && fit.h >= 6, `${def.id} fit to ${fit.w}x${fit.h}`);
    if (def.square) assert.equal(fit.w, fit.h, `${def.id} should stay square`);
  }
});

test('an unknown shape id still renders and keeps its id', () => {
  assert.equal(hasShape('not-a-real-shape'), false);
  const def = shapeDef('not-a-real-shape');
  assert.match(def.name, /Unknown/);
  const node = makeNode({ x: 0, y: 0, shape: 'not-a-real-shape' }, defaultSizeOf('not-a-real-shape'));
  assert.equal(node.shape, 'not-a-real-shape');
  assert.ok(geometryOf(node).path.startsWith('M'));
});

test('a new element needs only a definition', () => {
  registerShape({
    id: 'test-chevron',
    name: 'Chevron',
    category: 'flow',
    defaultSize: { w: 120, h: 60 },
    mermaid: { open: '[', close: ']' },
    geometry: ({ w, h }) => ({ path: `M 0 0 L ${w} 0 L ${w - 20} ${h} L 0 ${h} Z`, textBox: { x: 8, y: 8, w: w - 30, h: h - 16 } }),
  });
  assert.ok(hasShape('test-chevron'));
  assert.equal(shapeDef('test-chevron').name, 'Chevron');
  assert.ok(allShapes().some((s) => s.id === 'test-chevron'));
});

// ------------------------------------------------------------------ paths

test('path parsing accepts real path data and rejects anything else', () => {
  assert.equal(parsePath('M 0 0 H 10 V 10 H 0 Z').length, 5);
  assert.equal(parsePath('m0 0c1 2 3 4 5 6z').length, 3);
  assert.ok(isValidPath('M0 0 A 5 5 0 0 1 10 10 Z'));
  assert.equal(isValidPath('<svg><path d="M0 0"/></svg>'), false);
  assert.equal(isValidPath('alert(1)'), false);
  assert.equal(isValidPath(''), false);
  assert.equal(isValidPath('M 0'), false, 'a command missing a parameter is not valid');
  assert.equal(isValidPath('Z'), false, 'a path that draws nothing is not valid');
});

test('scaling a unit path respects what each command means', () => {
  const scaled = scaleUnitPath('M 0 0 H 1 V 1 H 0 Z', 200, 100);
  assert.equal(scaled, 'M 0 0 H 200 V 100 H 0 Z');
  // An arc scales its radii, keeps its flags, and scales its endpoint.
  const arc = scaleUnitPath('M 0 0 A 0.5 0.5 0 0 1 1 1', 100, 50);
  assert.equal(arc, 'M 0 0 A 50 25 0 0 1 100 50');
});

test('pasted paths are fitted into the unit box and keep their proportions', () => {
  const fitted = fitPathToUnitBox('M 100 100 H 300 V 200 H 100 Z');
  const bounds = pathBounds(parsePath(fitted));
  assert.ok(bounds.minX >= -0.001 && bounds.maxX <= 1.001, `x out of range: ${bounds.minX}..${bounds.maxX}`);
  assert.ok(bounds.minY >= -0.001 && bounds.maxY <= 1.001, `y out of range: ${bounds.minY}..${bounds.maxY}`);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  assert.ok(Math.abs(width / height - 2) < 0.01, 'a 2:1 shape should stay 2:1');
  assert.ok(Math.abs(width - 1) < 0.001, 'the long side fills the box');
});

test('fitting handles a path already in the unit box', () => {
  const again = fitPathToUnitBox(fitPathToUnitBox('M 0 0 H 50 V 50 H 0 Z'));
  const bounds = pathBounds(parsePath(again));
  assert.ok(bounds.maxX <= 1.001 && bounds.maxY <= 1.001);
});

// ------------------------------------------------------------- typography

test('text styles resolve shape defaults under node overrides', () => {
  const plain = resolveText(undefined, undefined);
  assert.equal(plain.size, 14);
  assert.equal(plain.align, 'center');
  assert.equal(plain.weight, 500);

  const heading = shapeDef('heading');
  const fromShape = resolveText(undefined, heading);
  assert.equal(fromShape.size, 22);
  assert.equal(fromShape.weight, 700, 'the heading shape is bold by default');
  assert.equal(fromShape.align, 'left');

  const overridden = resolveText({ size: 30, align: 'right', italic: true }, heading);
  assert.equal(overridden.size, 30);
  assert.equal(overridden.align, 'right');
  assert.equal(overridden.italic, true);
  assert.equal(overridden.weight, 700, 'an override must not drop the shape default');
});

test('font sizes are clamped to something drawable', () => {
  assert.equal(clampSize(0), 8);
  assert.equal(clampSize(5000), 96);
  assert.equal(clampSize(Number.NaN), 14);
  assert.equal(clampSize(18), 18);
});

test('styled measurement grows with size and respects upper case', () => {
  const small = measureStyled('Hello there', 400, resolveText({ size: 12 }));
  const large = measureStyled('Hello there', 400, resolveText({ size: 28 }));
  assert.ok(large.width > small.width, 'bigger text measures wider');
  assert.ok(large.height > small.height);
  const upper = measureStyled('hello', 400, resolveText({ uppercase: true }));
  assert.equal(upper.lines[0], 'HELLO');
});
