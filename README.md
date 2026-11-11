# UML Editor

A fast, local-first editor for flowcharts and UML class diagrams. It runs entirely in the
browser: diagrams are stored in `localStorage`, Mermaid code round-trips in both directions,
and a diagram can be drafted from a plain-English description — either instantly with a
built-in rule-based generator, or with a small language model that runs in the tab itself.

No server, no account, no telemetry.

## What it does

**Editing**

- Drag-and-drop shape palette, or double-click the canvas to drop a box and start typing.
- Drag from a selected shape's dot to connect it to another — drop on empty space and you
  get the next step, already wired up. `Tab` does the same from the keyboard.
- Multi-select (shift-click or marquee), move, resize, align, distribute, nudge.
- Undo/redo, copy/paste/duplicate, pan and zoom, snapping grid, light and dark themes.
- Layered auto-arrange (`⇧⌘L`) in any of four flow directions.
- 35+ elements in four categories, all defined in one place (see *Adding an element*):
  **flowchart** (process, decision, terminal, input/output, database, subroutine,
  preparation, connector, document, documents, delay, display, stored data, internal
  storage, off-page link, manual loop, junction), **UML** (class boxes with compartments
  and stereotypes, actor, use case, package, component, interface, deployment node, initial
  and final state, fork/join), **text and annotation** (free text, heading, note, callout,
  frame) and **your own shapes**.
- Text anywhere: free-text and heading elements live on the canvas outside the flow, and
  every label — on a shape, on an edge, or standing alone — has its own font, size, weight,
  slant, underline, case, colour and both alignments.
- UML arrowheads: open, filled, hollow triangle (generalisation), filled/hollow diamond
  (composition and aggregation), circle, cross; solid, dashed and thick lines.

**Storage**

- Every change is saved to this browser, debounced, with a document manager for renaming,
  duplicating, importing and deleting. Storage failures (private mode, quota) surface in the
  status bar rather than failing silently.
- Export to SVG, PNG (2×), Mermaid or full-fidelity JSON; import Mermaid, Markdown with a
  mermaid fence, or JSON.

**Mermaid, and what it cannot hold**

Mermaid describes structure — which boxes exist and how they connect. It has nothing to say
about free text, drawings, fonts or placement. The editor is explicit about that instead of
pretending otherwise:

- The Mermaid panel lists exactly what an export would lose, and names the JSON export as
  the lossless format.
- Elements Mermaid cannot express are **left out of the code and kept on the canvas**.
  Editing the Mermaid never deletes the free text, annotations or custom shapes the code
  never mentioned — nor the type settings on labels that did survive.
- A shape that exports as the nearest Mermaid equivalent (a document as `[...]`, say) is
  reported as an approximation, because reading the code back will change it.

The *Mermaid* tab is a two-way editor. Canvas edits rewrite the code; typing in the code
applies to the canvas after a short pause, keeping the positions of shapes that survive the
edit. Parse errors are reported with line numbers and never destroy your diagram.

Supported: `flowchart` / `graph` in all four directions, every node bracket shape, the
`A -- label --> B` and `A -->|label| B` spellings, chains, `&` fan-out, `subgraph`,
`classDef` / `class` / `style` fills, comments; and `classDiagram` with members,
stereotypes, cardinality and the full relation vocabulary (`<|--`, `*--`, `o--`, `..>`, …).

Not yet supported: sequence, state, ER, gantt and the other Mermaid diagram types — those
are reported as unsupported rather than mangled.

**Drafting from a description, or from a picture**

The *Generate* tab has two generators plus an image reader:

- **Instant** (the default) — a rule-based reader of your words. No download, works offline,
  returns in milliseconds. It understands sequences, `if … otherwise …` branches, loops and
  "go back to …", numbered steps, `A -> B: label` edge lists, and picks shapes from the verbs
  you use (*save*/*database* → cylinder, *upload*/*submit* → input, *email*/*notify* → output).
  Prompts about classes, fields and `extends` produce a UML class diagram instead.
- **Local model** — downloads a small instruction-tuned model (Qwen2.5 1.5B by default, ~1 GB)
  via [WebLLM](https://github.com/mlc-ai/web-llm) and runs it on WebGPU, in your tab. It is
  asked for Mermaid, which is then parsed and validated; if it returns something unusable the
  editor retries once and then falls back to the instant generator rather than showing
  nothing. Needs Chrome/Edge 113+ or Safari 18+; the weights are cached by the browser, so
  after the first run it works offline too.

- **From a picture** — drop a screenshot or a photo of a whiteboard onto the panel (or
  onto the canvas, or paste it), and `Phi-3.5-vision` reads it on WebGPU and writes out the
  Mermaid, which is parsed and laid out like any other diagram. The image is downscaled to
  768px and stays in the tab. This model is a large first download (a few GB) and is only
  offered when an image is actually attached; without WebGPU the panel says so instead of
  failing obscurely. Expect a clean screenshot to come back close to exact and a hurried
  whiteboard sketch to need tidying — it is a 4B-parameter model running in a browser tab.

Nothing is uploaded in any mode.

## Running it

```bash
npm install
npm run dev              # the editor, http://localhost:5173
npm run storybook        # the component library, http://localhost:6006
npm test                 # parser, serializer, generator, layout and routing tests
npm run typecheck
npm run build            # the app       -> dist/
npm run build-storybook  # the library   -> storybook-static/
```

## Storybook

Every panel, overlay and canvas state has a story, grouped as **Foundations**
(buttons, inputs, swatches, icons), **Canvas**, **Panels**, **Chrome** and
**Overlays**. Stories live beside the code they cover (`src/ui/*.stories.ts`,
`src/render/scene.stories.ts`).

Each story builds the real component against a real `Editor`, so the
interactions work: select a shape and the inspector follows it, type Mermaid and
the canvas redraws. Story editors are constructed with `persist: false`, so
browsing the library never reads or overwrites the diagrams in your browser.
Shared fixtures and frames live in `src/stories/harness.ts`; the fixtures are
Mermaid source, so loading a story also exercises the parser.

The theme switcher in the Storybook toolbar flips `data-theme` on the document,
which is the same switch the app uses — components should look deliberate in
both. CI builds Storybook on branches and pull requests, so a story that stops
compiling or rendering fails the build.

## Hosting on GitHub Pages

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or to whatever the repository's default branch is — the workflow accepts
   either, so reorganising the branches does not break publishing). You can also publish any
   branch by hand with **Actions → Deploy to GitHub Pages → Run workflow**.

   GitHub only lets the `github-pages` environment deploy from branches listed under
   **Settings → Environments → github-pages → Deployment branches**, which is `main` by
   default.

The workflow type-checks, runs the tests, builds with the repository name as the base path
and publishes `dist/`. The site then lives at `https://<user>.github.io/<repo>/`.

## Adding an element

Elements are data, not code paths. One `ShapeDefinition` is the whole thing:

```ts
registerShape({
  id: 'chevron',
  name: 'Chevron',
  category: 'flow',
  defaultSize: { w: 150, h: 60 },
  mermaid: { open: '[', close: ']' },   // or null: "Mermaid cannot say this"
  geometry: ({ w, h }) => ({
    path: `M 0 0 H ${w} L ${w - 20} ${h} H 0 Z`,
    textBox: { x: 10, y: 8, w: w - 40, h: h - 16 },
  }),
});
```

The palette, the inspector's shape picker, auto-sizing, the Mermaid mapping, the fidelity
report and the Storybook gallery all read from the registry, so nothing else needs editing.
Built-ins live in `src/shapes/builtin.ts`.

**Your own shapes.** *Your shapes → +* in the palette takes SVG path data, fits it into a
unit box, stores it in this browser and registers it like any built-in. Only path data is
accepted and it is parsed before being stored, so nothing executable can enter a library
that other documents reach. A shape you use is copied onto the node as well, so sharing a
diagram still draws correctly for someone who does not have your library. Freehand drawing
on the canvas is the obvious next step and is not built yet.

## How it is put together

No UI framework and no diagramming library — the editor is ~4k lines of TypeScript and ships
as about 37 KB gzipped, which is what keeps it feeling immediate.

```
src/
  core/      model, store (snapshot undo + debounced persistence), geometry, layered
             layout, document merging
  shapes/    the element registry, built-in definitions, SVG path handling, user shapes
  render/    keyed SVG scene, edge routing, typography, text measurement, theme
  mermaid/   parser (with line-accurate errors), serializer, fidelity report
  ai/        rule-based generator, WebLLM loader, image preparation, orchestration
  io/        SVG/PNG/JSON export, clipboard, file pickers
  ui/        toolbar, palette, inspector, Mermaid panel, generate panel, documents, modals
  editor.ts  canvas interaction and every document command
```

Design notes worth knowing if you extend it:

- **The store is the only writer.** `Editor` methods call `store.patch(fn)`; patches snapshot
  the document for undo and coalesce by key so a drag is one history entry.
- **Rendering is keyed, not diffed.** Each node keeps a DOM group that is rebuilt only when
  its content signature changes; moving a node writes one `transform`.
- **Shapes are declared once** in the registry and reused by the canvas, the palette
  thumbnails, the inspector and the SVG export, so they can never drift apart.
- **Appearance is not structure.** Type settings and drawings live on the document, never in
  the Mermaid source, and `core/merge.ts` is what guarantees applying code cannot destroy
  them.
- **The Mermaid parser is hand-written** and returns `{diagram, errors, warnings}` — it never
  throws and never half-applies.
- **Auto-arrange is a real layered layout**: cycles broken, longest-path ranks, dummy nodes
  for edges that skip a rank (these reserve the lane the edge is drawn in), barycentre
  ordering and Sugiyama's priority method for coordinates. Lanes come back as `waypoints` on
  the edge, stamped with the endpoint positions they assume, so a stale route is ignored
  rather than drawn wrong.

## Known limits

- Only flowchart and class diagrams; other Mermaid types are rejected with a clear message.
- Reading a diagram out of an image needs WebGPU and a few GB of download, and the result is
  a draft to check rather than a faithful transcription.
- Subgraphs are imported, drawn and exported, but cannot yet be created from the canvas.
- Custom shapes come from pasted SVG path data; there is no freehand drawing tool yet.
- Themes are still just light and dark. The canvas already resolves every colour through
  palette tokens, so further themes are a data change, but the app chrome would need its own
  CSS variables set.
- Edges route automatically. Auto-arrange reserves a lane for every edge that skips a rank,
  so edges do not run under shapes, but you cannot yet drag a bend point by hand.
- `localStorage` is per-browser: diagrams do not follow you between devices. Export JSON to
  move them.
