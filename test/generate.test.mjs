import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFromPrompt, extractMermaid, layoutDiagram, normalizeDiagram } from './.build/testables.mjs';

/**
 * A generated diagram must have valid edges, real geometry, no overlapping
 * shapes, and no more than `maxComponents` disconnected pieces (flowcharts
 * should always be one; a class model may legitimately have several).
 */
function assertWellFormed(doc, { minNodes = 2, maxComponents = 1 } = {}) {
  assert.ok(doc.nodes.length >= minNodes, `expected >= ${minNodes} nodes, got ${doc.nodes.length}`);
  const ids = new Set(doc.nodes.map((n) => n.id));
  for (const e of doc.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to), 'edge points at a missing node');
  }
  const adj = new Map([...ids].map((id) => [id, []]));
  for (const e of doc.edges) {
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  const seen = new Set();
  let components = 0;
  for (const node of doc.nodes) {
    if (seen.has(node.id)) continue;
    components++;
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length) {
      for (const next of adj.get(queue.pop())) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  }
  assert.ok(
    components <= maxComponents,
    `expected at most ${maxComponents} connected piece(s), found ${components}`,
  );
  const isolated = doc.nodes.filter((n) => !adj.get(n.id).length).map((n) => n.label);
  assert.deepEqual(isolated, [], `nodes with no connections: ${isolated.join(', ')}`);
  // A decision cannot have two branches wearing the same label.
  const branchLabels = new Map();
  for (const e of doc.edges) {
    if (!e.label) continue;
    const key = `${e.from}|${e.label}`;
    branchLabels.set(key, (branchLabels.get(key) ?? 0) + 1);
  }
  const dupes = [...branchLabels].filter(([, count]) => count > 1).map(([key]) => key);
  assert.deepEqual(dupes, [], `repeated branch labels out of one shape: ${dupes.join(', ')}`);
  for (const n of doc.nodes) {
    assert.ok(n.w > 0 && n.h > 0, 'node has no size');
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), 'node has no position');
  }
  for (let i = 0; i < doc.nodes.length; i++) {
    for (let j = i + 1; j < doc.nodes.length; j++) {
      const a = doc.nodes[i];
      const b = doc.nodes[j];
      const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.ok(!overlap, `"${a.label}" overlaps "${b.label}"`);
    }
  }
}

test('turns a sequential description into a flow with terminals', () => {
  const doc = generateFromPrompt('Lint the code. Run the tests. Build the image. Deploy to staging.');
  assertWellFormed(doc, { minNodes: 6 });
  assert.equal(doc.nodes[0].label, 'Start');
  assert.ok(doc.nodes.some((n) => n.label === 'End'));
  assert.ok(doc.nodes.some((n) => n.label === 'Run the tests'));
});

test('builds a decision with yes and no branches', () => {
  const doc = generateFromPrompt(
    'Customer places an order. If the card is declined, cancel the order, otherwise charge the card. Send a receipt.',
  );
  assertWellFormed(doc, { minNodes: 6 });
  const decision = doc.nodes.find((n) => n.shape === 'diamond');
  assert.ok(decision, 'expected a decision shape');
  const labels = doc.edges.filter((e) => e.from === decision.id).map((e) => e.label).sort();
  assert.deepEqual(labels, ['No', 'Yes']);
});

test('keeps the flow connected when a step loops back', () => {
  const doc = generateFromPrompt(
    'User signs in. If the password is wrong, show an error and go back to sign in. Otherwise open the dashboard. Log the visit.',
  );
  assertWellFormed(doc, { minNodes: 6 });
  const back = doc.edges.find((e) => e.line === 'dashed');
  assert.ok(back, 'expected a dashed loop-back edge');
  assert.ok(doc.nodes.some((n) => /error/i.test(n.label)), 'the error step should survive');
  assert.ok(doc.nodes.some((n) => /dashboard/i.test(n.label)), 'the else branch should survive');
});

test('reads numbered and bulleted steps', () => {
  const doc = generateFromPrompt('1. Receive the file\n2. Validate the schema\n3. Store the rows\n4. Notify the owner');
  assertWellFormed(doc, { minNodes: 6 });
  assert.ok(doc.nodes.some((n) => n.label === 'Validate the schema'));
  assert.ok(doc.nodes.some((n) => n.shape === 'cylinder'), 'storing should look like data');
});

test('reads an arrow list as an explicit graph', () => {
  const doc = generateFromPrompt('Browser -> CDN -> API: cache miss\nAPI -> Database\nAPI -> Queue');
  assertWellFormed(doc, { minNodes: 5 });
  assert.equal(doc.nodes.length, 5);
  assert.equal(doc.edges.length, 4);
  assert.ok(doc.edges.some((e) => e.label === 'cache miss'));
  assert.ok(doc.nodes.some((n) => n.label === 'Database' && n.shape === 'cylinder'));
});

test('picks shapes from the words used', () => {
  const doc = generateFromPrompt('User uploads a photo. Save it to the database. Email the user.');
  const shapes = Object.fromEntries(doc.nodes.map((n) => [n.label, n.shape]));
  assert.equal(shapes.Start, 'stadium');
  assert.equal(shapes['User uploads a photo'], 'parallelogram');
  assert.equal(shapes['Save it to the database'], 'cylinder');
  assert.equal(shapes['Email the user'], 'parallelogram-alt');
});

test('builds a class diagram when the prompt describes a model', () => {
  const doc = generateFromPrompt(
    'Classes: Order has fields id, total, status. Order has many OrderLine. OrderLine belongs to Product. PremiumCustomer extends Customer. Customer can login and logout.',
  );
  assert.equal(doc.kind, 'class');
  assertWellFormed(doc, { minNodes: 5, maxComponents: 2 });
  const order = doc.nodes.find((n) => n.label === 'Order');
  assert.deepEqual(order.attributes, ['+id', '+total', '+status']);
  const customer = doc.nodes.find((n) => n.label === 'Customer');
  assert.deepEqual(customer.methods, ['+login()', '+logout()']);
  const inherit = doc.edges.find((e) => e.endArrow === 'triangle');
  assert.ok(inherit, 'extends should become a generalisation');
});

test('an empty prompt yields an empty diagram rather than throwing', () => {
  const doc = generateFromPrompt('   ');
  assert.equal(doc.nodes.length, 0);
});

test('extracts mermaid from a chatty model reply', () => {
  const reply = 'Sure! Here you go:\n```mermaid\nflowchart TD\n  a[One] --> b[Two]\n```\nHope that helps.';
  assert.equal(extractMermaid(reply), 'flowchart TD\n  a[One] --> b[Two]');
  assert.equal(extractMermaid('flowchart LR\n a --> b'), 'flowchart LR\n a --> b');
  assert.equal(extractMermaid('I cannot do that.'), null);
});

test('layout ranks a cyclic graph without hanging', () => {
  const doc = normalizeDiagram({
    nodes: [
      { id: 'a', label: 'A', shape: 'rect', x: 0, y: 0, w: 100, h: 50 },
      { id: 'b', label: 'B', shape: 'rect', x: 0, y: 0, w: 100, h: 50 },
      { id: 'c', label: 'C', shape: 'rect', x: 0, y: 0, w: 100, h: 50 },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', line: 'solid', startArrow: 'none', endArrow: 'arrow' },
      { id: 'e2', from: 'b', to: 'c', line: 'solid', startArrow: 'none', endArrow: 'arrow' },
      { id: 'e3', from: 'c', to: 'a', line: 'solid', startArrow: 'none', endArrow: 'arrow' },
    ],
  });
  layoutDiagram(doc, { direction: 'TB' });
  const ys = doc.nodes.map((n) => n.y);
  assert.equal(new Set(ys).size, 3, 'each node should land on its own rank');
  layoutDiagram(doc, { direction: 'LR' });
  assert.equal(new Set(doc.nodes.map((n) => n.x)).size, 3);
});

test('image downscaling keeps the aspect ratio and never enlarges', async () => {
  const { planResize, MAX_IMAGE_SIDE } = await import('./.build/testables.mjs');
  assert.deepEqual(planResize(400, 300), { width: 400, height: 300 });
  assert.deepEqual(planResize(1536, 768, 768), { width: 768, height: 384 });
  assert.deepEqual(planResize(768, 1536, 768), { width: 384, height: 768 });
  const wide = planResize(4000, 25, MAX_IMAGE_SIDE);
  assert.equal(wide.width, MAX_IMAGE_SIDE);
  assert.ok(wide.height >= 1, 'a very wide image must not collapse to zero height');
  assert.deepEqual(planResize(0, 0), { width: 1, height: 1 });
});

test('the image instructions ask for parseable output and the retry says what broke', async () => {
  const { IMAGE_INSTRUCTION, repairInstruction } = await import('./.build/testables.mjs');
  assert.match(IMAGE_INSTRUCTION, /Mermaid code ONLY/);
  assert.match(IMAGE_INSTRUCTION, /flowchart TD/);
  assert.match(repairInstruction('no Mermaid code in the reply'), /could not be parsed: no Mermaid code/);
});

test('reads mermaid out of a vision reply that starts with chatter', async () => {
  const { extractMermaid } = await import('./.build/testables.mjs');
  const reply = 'The image shows a login flow.\n\nflowchart TD\n  a["Sign in"] --> b["Dashboard"]\n\nThis diagram shows the steps.';
  assert.equal(extractMermaid(reply), 'flowchart TD\n  a["Sign in"] --> b["Dashboard"]');
});
