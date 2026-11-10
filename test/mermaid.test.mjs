import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMermaid, toMermaid, parseNodeSpec, normalizeLinkLabels, decodeLabel } from './.build/testables.mjs';

const parse = (code) => {
  const result = parseMermaid(code);
  assert.deepEqual(result.errors, [], `unexpected errors: ${JSON.stringify(result.errors)}`);
  assert.ok(result.diagram, 'expected a diagram');
  return result.diagram;
};

test('parses a basic flowchart with shapes and arrow kinds', () => {
  const d = parse(`flowchart TD
    a[Process] --> b{Decision}
    b -.-> c([Terminal])
    b ==> d[(Database)]
    c --- e((Circle))
    d --x f[[Subroutine]]`);
  assert.equal(d.kind, 'flowchart');
  assert.equal(d.direction, 'TB');
  assert.equal(d.nodes.length, 6);
  const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
  assert.equal(byId.a.shape, 'rect');
  assert.equal(byId.b.shape, 'diamond');
  assert.equal(byId.c.shape, 'stadium');
  assert.equal(byId.d.shape, 'cylinder');
  assert.equal(byId.e.shape, 'circle');
  assert.equal(byId.f.shape, 'subroutine');
  const edge = (from, to) => d.edges.find((x) => x.from === from && x.to === to);
  assert.equal(edge('a', 'b').line, 'solid');
  assert.equal(edge('b', 'c').line, 'dashed');
  assert.equal(edge('b', 'd').line, 'thick');
  assert.equal(edge('c', 'e').endArrow, 'none');
  assert.equal(edge('d', 'f').endArrow, 'cross');
});

test('reads both edge label spellings', () => {
  const d = parse(`graph LR
    a -->|yes| b
    a -- no --> c
    a -. maybe .-> e
    a == heavy ==> f`);
  const labels = d.edges.map((x) => x.label).sort();
  assert.deepEqual(labels, ['heavy', 'maybe', 'no', 'yes']);
  assert.equal(d.direction, 'LR');
});

test('handles chains, ampersand fan-out, quotes and <br>', () => {
  const d = parse(`flowchart TD
    a["Line one<br/>Line two"] --> b & c
    b & c --> d["Quote #quot;here#quot;"]`);
  assert.equal(d.nodes.find((n) => n.id === 'a').label, 'Line one\nLine two');
  assert.equal(d.nodes.find((n) => n.id === 'd').label, 'Quote "here"');
  assert.equal(d.edges.length, 4);
});

test('supports subgraphs, comments, directives and styles', () => {
  const d = parse(`flowchart LR
    %% a comment --> ignored
    classDef hot fill:#ff0000
    subgraph svc["Service layer"]
      direction TB
      api[API] --> worker[Worker]
    end
    worker --> db[(Store)]
    api:::hot
    style db fill:#00ff00`);
  assert.equal(d.groups.length, 1);
  assert.equal(d.groups[0].label, 'Service layer');
  assert.equal(d.nodes.filter((n) => n.parent === 'svc').length, 2);
  assert.equal(d.nodes.find((n) => n.id === 'api').color, '#ff0000');
  assert.equal(d.nodes.find((n) => n.id === 'db').color, '#00ff00');
});

test('parses class diagrams with members, cardinality and relations', () => {
  const d = parse(`classDiagram
    class Order {
      +int id
      +float total
      +submit() bool
    }
    class Shape {
      <<interface>>
    }
    Customer "1" --> "*" Order : places
    Order *-- OrderLine
    Order o-- Coupon
    Customer <|-- PremiumCustomer
    Shape <|.. Circle
    Order ..> Mailer`);
  assert.equal(d.kind, 'class');
  const order = d.nodes.find((n) => n.label === 'Order');
  assert.deepEqual(order.attributes, ['+int id', '+float total']);
  assert.deepEqual(order.methods, ['+submit() bool']);
  assert.equal(d.nodes.find((n) => n.label === 'Shape').stereotype, 'interface');
  const rel = (from, to) => d.edges.find((e) => e.from === from && e.to === to);
  assert.equal(rel('Customer', 'Order').label, '"1" places "*"');
  assert.equal(rel('Order', 'OrderLine').startArrow, 'diamond');
  assert.equal(rel('Order', 'Coupon').startArrow, 'odiamond');
  assert.equal(rel('Customer', 'PremiumCustomer').startArrow, 'triangle');
  assert.equal(rel('Shape', 'Circle').line, 'dashed');
  assert.equal(rel('Order', 'Mailer').endArrow, 'open');
});

test('reports errors with line numbers instead of guessing', () => {
  const bad = parseMermaid('sequenceDiagram\n  a->>b: hi');
  assert.equal(bad.diagram, null);
  assert.equal(bad.errors[0].line, 1);
  assert.match(bad.errors[0].message, /Unsupported diagram type/);

  const empty = parseMermaid('   ');
  assert.equal(empty.diagram, null);
});

test('round-trips flowcharts through the serializer', () => {
  const source = `flowchart LR
    start(["Begin"]) --> check{"Ready?"}
    check -->|"Yes"| work["Do the work"]
    check -->|"No"| wait["Wait"]
    wait --> check
    work --> db[("Save")]
    db --> done(["Done"])`;
  const first = parse(source);
  const code = toMermaid(first);
  const second = parse(code);
  assert.equal(second.nodes.length, first.nodes.length);
  assert.equal(second.edges.length, first.edges.length);
  assert.deepEqual(
    second.nodes.map((n) => [n.label, n.shape]).sort(),
    first.nodes.map((n) => [n.label, n.shape]).sort(),
  );
  assert.deepEqual(second.edges.map((e) => e.label).sort(), first.edges.map((e) => e.label).sort());
  assert.equal(second.direction, 'LR');
});

test('round-trips class diagrams through the serializer', () => {
  const source = `classDiagram
    class Animal {
      <<abstract>>
      +String name
      +speak()
    }
    Animal <|-- Dog
    Animal *-- Leg
    Dog ..> Vet : visits`;
  const first = parse(source);
  const second = parse(toMermaid(first));
  assert.equal(second.kind, 'class');
  assert.equal(second.nodes.length, 4);
  const animal = second.nodes.find((n) => n.label === 'Animal');
  assert.equal(animal.stereotype, 'abstract');
  assert.deepEqual(animal.attributes, ['+String name']);
  assert.deepEqual(animal.methods, ['+speak()']);
  const visit = second.edges.find((e) => e.label === 'visits');
  assert.equal(visit.line, 'dashed');
});

test('node spec parser covers every bracket pair', () => {
  const cases = {
    'a[x]': 'rect',
    'a(x)': 'round',
    'a([x])': 'stadium',
    'a[[x]]': 'subroutine',
    'a[(x)]': 'cylinder',
    'a((x))': 'circle',
    'a{x}': 'diamond',
    'a{{x}}': 'hexagon',
    'a[/x/]': 'parallelogram',
    'a[\\x\\]': 'parallelogram-alt',
    'a[/x\\]': 'trapezoid',
    'a[\\x/]': 'trapezoid-alt',
  };
  for (const [input, shape] of Object.entries(cases)) {
    const spec = parseNodeSpec(input);
    assert.equal(spec.shape, shape, `${input} -> ${shape}`);
    assert.equal(spec.label, 'x');
  }
  assert.equal(parseNodeSpec('plain').label, undefined);
  assert.equal(parseNodeSpec('plain').id, 'plain');
});

test('link label normalisation leaves plain arrows alone', () => {
  assert.equal(normalizeLinkLabels('a --> b'), 'a --> b');
  assert.equal(normalizeLinkLabels('a ---- b'), 'a ---- b');
  assert.match(normalizeLinkLabels('a -- yes --> b'), /-->\|yes\|/);
  assert.match(normalizeLinkLabels('a == go ==> b'), /==>\|go\|/);
  assert.match(normalizeLinkLabels('a -. maybe .-> b'), /-\.->\|maybe\|/);
});

test('decodes entity escapes in labels', () => {
  assert.equal(decodeLabel('"a &amp; b"'), 'a & b');
  assert.equal(decodeLabel('one<br>two'), 'one\ntwo');
});
