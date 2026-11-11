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
- 15 shapes: process, decision, terminal, input/output, database, subroutine, preparation,
  connector, manual op/input, plus UML class boxes (with attribute and method compartments
  and stereotypes), actors and notes.
- UML arrowheads: open, filled, hollow triangle (generalisation), filled/hollow diamond
  (composition and aggregation), circle, cross; solid, dashed and thick lines.

**Storage**

- Every change is saved to this browser, debounced, with a document manager for renaming,
  duplicating, importing and deleting. Storage failures (private mode, quota) surface in the
  status bar rather than failing silently.
- Export to SVG, PNG (2×), Mermaid or full-fidelity JSON; import Mermaid, Markdown with a
  mermaid fence, or JSON.

**Mermaid**

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
npm run dev        # http://localhost:5173
npm test           # parser, serializer, generator and layout tests
npm run typecheck
npm run build      # -> dist/
```

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

## How it is put together

No UI framework and no diagramming library — the editor is ~4k lines of TypeScript and ships
as about 37 KB gzipped, which is what keeps it feeling immediate.

```
src/
  core/      model, store (snapshot undo + debounced persistence), geometry, layered layout
  render/    keyed SVG scene, edge routing, shape geometry, text measurement, theme
  mermaid/   parser (with line-accurate errors) and serializer
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
- **Shapes are declared once** in `render/shapes.ts` and reused by the canvas, the palette
  thumbnails and the SVG export, so the three can never drift apart.
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
- Edges route automatically. Auto-arrange reserves a lane for every edge that skips a rank,
  so edges do not run under shapes, but you cannot yet drag a bend point by hand.
- `localStorage` is per-browser: diagrams do not follow you between devices. Export JSON to
  move them.
