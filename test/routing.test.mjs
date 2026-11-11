import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFromPrompt,
  layoutDiagram,
  parseMermaid,
  resolveOverlaps,
  routeEdge,
  squareUp,
  waypointsValid,
  adjustRoutes,
} from './.build/testables.mjs';

/** Does segment a-b pass through rect r (shrunk slightly to ignore grazing)? */
function segmentHitsRect(a, b, r, inset = 3) {
  const box = { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 };
  if (box.w <= 0 || box.h <= 0) return false;
  const inside = (p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
  if (inside(a) || inside(b)) return true;
  const edges = [
    [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }],
    [{ x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }],
    [{ x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }],
    [{ x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }],
  ];
  return edges.some(([c, d]) => segmentsCross(a, b, c, d));
}

function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Route every edge the way the canvas would and report shapes it crosses. */
function crossings(doc) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const found = [];
  for (const edge of doc.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || from === to) continue;
    const { points } = routeEdge(doc, edge, from, to, 0);
    for (let i = 1; i < points.length; i++) {
      for (const n of doc.nodes) {
        if (n.id === edge.from || n.id === edge.to) continue;
        if (segmentHitsRect(points[i - 1], points[i], n)) {
          found.push(`${from.label} -> ${to.label} crosses ${n.label}`);
        }
      }
    }
  }
  return [...new Set(found)];
}

const laidOut = (code) => {
  const { diagram, errors } = parseMermaid(code);
  assert.deepEqual(errors, []);
  layoutDiagram(diagram);
  resolveOverlaps(diagram);
  return diagram;
};

test('an edge that skips a rank gets its own lane and crosses nothing', () => {
  // The shape of the bug: the "No" branch jumps from the decision straight to
  // the step after the "Yes" branch, passing over whatever sits in between.
  const doc = laidOut(`flowchart TD
    a["Request arrives"] --> b{"Cache miss?"}
    b -->|Yes| c["Query the database"]
    b -->|No| d["Return the response"]
    c --> d`);
  const skipping = doc.edges.find((e) => {
    const from = doc.nodes.find((n) => n.id === e.from);
    const to = doc.nodes.find((n) => n.id === e.to);
    return from.label.includes('Cache') && to.label.includes('Return');
  });
  assert.ok(skipping.waypoints?.length, 'the skipping edge should have a reserved lane');
  assert.deepEqual(crossings(doc), []);
});

test('lanes keep long edges clear in a bigger generated flow', () => {
  const doc = generateFromPrompt(
    'Request arrives. Check the cache. If it is a miss, query the database and save it to the cache. Return the response.',
  );
  assert.deepEqual(crossings(doc), []);
});

test('several prompts all lay out without an edge under a shape', () => {
  const prompts = [
    'Customer places an order. If the card is declined, cancel the order, otherwise charge the card. Send a receipt.',
    'User signs in. If the password is wrong, show an error and go back to sign in. Otherwise open the dashboard. Log the visit.',
    'Lint. Run tests. Build the image. If the build fails, notify the team and go back to lint. Otherwise deploy. Run smoke tests.',
  ];
  for (const prompt of prompts) {
    assert.deepEqual(crossings(generateFromPrompt(prompt)), [], `prompt: ${prompt}`);
  }
});

test('a long skip across many ranks still routes clear', () => {
  const doc = laidOut(`flowchart TD
    a[Step one] --> b[Step two]
    b --> c[Step three]
    c --> d[Step four]
    d --> e[Step five]
    a --> e`);
  const skip = doc.edges.find((e) => e.from === 'a' && e.to === 'e');
  // Three skipped ranks, each contributing a lane entry and a lane exit.
  assert.equal(skip.waypoints.length, 6);
  const lanes = new Set(skip.waypoints.map((p) => p.x));
  assert.equal(lanes.size, 1, 'the lane should stay in one column');
  assert.deepEqual(crossings(doc), []);
});

test('lanes work left-to-right too', () => {
  const doc = laidOut(`flowchart LR
    a[One] --> b[Two]
    b --> c[Three]
    a --> c`);
  assert.deepEqual(crossings(doc), []);
  const skip = doc.edges.find((e) => e.from === 'a' && e.to === 'c');
  assert.equal(skip.waypoints.length, 2);
  assert.equal(new Set(skip.waypoints.map((p) => p.y)).size, 1, 'one horizontal lane');
});

test('routes are squared off, never diagonal, in orthogonal mode', () => {
  const doc = laidOut(`flowchart TD
    a[One] --> b[Two]
    b --> c[Three]
    a --> c`);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const e of doc.edges) {
    const { points } = routeEdge(doc, e, byId.get(e.from), byId.get(e.to), 0);
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      const dy = Math.abs(points[i].y - points[i - 1].y);
      assert.ok(dx < 0.6 || dy < 0.6, `diagonal segment in ${e.from}->${e.to}`);
    }
  }
});

test('waypoints are discarded once an endpoint moves', () => {
  const doc = laidOut(`flowchart TD
    a[One] --> b[Two]
    b --> c[Three]
    a --> c`);
  const skip = doc.edges.find((e) => e.from === 'a' && e.to === 'c');
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  assert.equal(waypointsValid(skip, byId.get('a'), byId.get('c')), true);
  byId.get('c').x += 240;
  assert.equal(waypointsValid(skip, byId.get('a'), byId.get('c')), false);
  // and the route still draws, just directly
  const { points } = routeEdge(doc, skip, byId.get('a'), byId.get('c'), 0);
  assert.ok(points.length >= 2);
});

test('dragging a whole sub-graph keeps its lanes, moving one end drops them', () => {
  const doc = laidOut(`flowchart TD
    a[One] --> b[Two]
    b --> c[Three]
    a --> c`);
  const skip = () => doc.edges.find((e) => e.from === 'a' && e.to === 'c');
  const before = skip().waypoints.map((p) => ({ ...p }));
  for (const n of doc.nodes) {
    n.x += 50;
    n.y += 20;
  }
  adjustRoutes(doc, new Set(['a', 'b', 'c']), 50, 20);
  assert.deepEqual(
    skip().waypoints,
    before.map((p) => ({ x: p.x + 50, y: p.y + 20 })),
  );
  adjustRoutes(doc, new Set(['c']));
  assert.equal(skip().waypoints, undefined);
});

test('squareUp inserts corners and drops duplicate points', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 40 }, { x: 10, y: 80 }];
  const out = squareUp(pts, true);
  assert.deepEqual(out, [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 10, y: 40 }, { x: 10, y: 80 }]);
  assert.deepEqual(squareUp([{ x: 5, y: 5 }, { x: 5, y: 5 }], true), [{ x: 5, y: 5 }]);
});
