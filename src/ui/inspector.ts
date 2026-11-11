import type { Editor } from '../editor';
import type { ArrowHead, Direction, EdgeLine, TextFont, TextStyle } from '../core/model';
import { PALETTE_KEYS, themeFor } from '../render/theme';
import { FONT_LABELS, MAX_FONT_SIZE, MIN_FONT_SIZE, resolveText } from '../render/typography';
import { CATEGORY_LABELS, CATEGORY_ORDER, shapeDef, shapesByCategory } from '../shapes/registry';
import { clearChildren, h, iconButton, select } from './dom';
import { icons } from './icons';
import { shapePreview } from './palette';

const ARROWS: { value: ArrowHead; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'open', label: 'Open arrow' },
  { value: 'triangle', label: 'Hollow triangle (inherits)' },
  { value: 'diamond', label: 'Filled diamond (composition)' },
  { value: 'odiamond', label: 'Hollow diamond (aggregation)' },
  { value: 'circle', label: 'Circle' },
  { value: 'cross', label: 'Cross' },
];

export function createInspector(editor: Editor): { el: HTMLElement; refresh: () => void } {
  const root = h('div', { class: 'inspector' });
  let signature = '';

  const refresh = (force = false) => {
    const store = editor.store;
    const sig = [
      [...store.selection.nodes].sort().join(','),
      [...store.selection.edges].sort().join(','),
      store.doc.kind,
      store.doc.direction,
    ].join('|');
    const typing = root.contains(document.activeElement) && document.activeElement?.tagName !== 'BUTTON';
    if (!force && sig === signature && typing) return;
    signature = sig;
    clearChildren(root);
    if (store.selectedNodes().length) renderNodeProps(root, editor);
    else if (store.selectedEdges().length) renderEdgeProps(root, editor);
    else renderDiagramProps(root, editor);
  };

  editor.store.subscribe(() => refresh());
  refresh(true);
  return { el: root, refresh: () => refresh(true) };
}

function row(label: string, ...children: (Node | string | false | undefined)[]): HTMLElement {
  return h('div', { class: 'field' }, h('label', { class: 'field-label', text: label }), h('div', { class: 'field-control' }, ...children));
}

function renderNodeProps(root: HTMLElement, editor: Editor): void {
  const nodes = editor.store.selectedNodes();
  const first = nodes[0];
  if (!first) return;
  const multi = nodes.length > 1;
  root.append(h('div', { class: 'panel-label', text: multi ? `${nodes.length} shapes` : shapeDef(first.shape).name }));

  if (!multi) {
    const labelInput = h('textarea', { class: 'input', value: first.label, placeholder: 'Label' });
    labelInput.rows = 2;
    labelInput.addEventListener('input', () => {
      editor.store.patch(
        (doc) => {
          const n = doc.nodes.find((x) => x.id === first.id);
          if (n) n.label = labelInput.value;
        },
        { label: 'label', coalesce: `label:${first.id}` },
      );
    });
    root.append(row('Label', labelInput));
  }

  const shapeSection = h('div', { class: 'shape-sections' });
  for (const category of CATEGORY_ORDER) {
    const shapes = shapesByCategory(category);
    if (!shapes.length) continue;
    const grid = h('div', { class: 'shape-grid' });
    for (const def of shapes) {
      const active = nodes.every((n) => n.shape === def.id);
      grid.append(
        h('button', {
          class: `shape-chip ${active ? 'active' : ''}`,
          type: 'button',
          title: def.name,
          html: shapePreview(def.id, 34, 24),
          on: { click: () => editor.setShape(def.id) },
        }),
      );
    }
    shapeSection.append(h('div', { class: 'shape-section-label', text: CATEGORY_LABELS[category] }), grid);
  }
  root.append(row('Shape', shapeSection));

  const theme = themeFor(editor.store.prefs.theme);
  const swatches = h('div', { class: 'swatches' });
  for (const key of PALETTE_KEYS) {
    const entry = theme.palette[key];
    const active = nodes.every((n) => (n.color ?? 'default') === key);
    swatches.append(
      h('button', {
        class: `swatch ${active ? 'active' : ''}`,
        type: 'button',
        title: entry.name,
        style: { background: entry.fill, borderColor: entry.stroke },
        on: { click: () => editor.updateSelectedNodes((n) => void (n.color = key === 'default' ? undefined : key), 'colour') },
      }),
    );
  }
  root.append(row('Colour', swatches));

  if (!multi && first.shape === 'class') {
    const attrs = h('textarea', { class: 'input mono', value: (first.attributes ?? []).join('\n'), placeholder: '+id: string' });
    attrs.rows = 3;
    attrs.addEventListener('input', () => {
      editor.store.patch(
        (doc) => {
          const n = doc.nodes.find((x) => x.id === first.id);
          if (n) n.attributes = splitLines(attrs.value);
        },
        { label: 'attributes', coalesce: `attrs:${first.id}` },
      );
    });
    const methods = h('textarea', { class: 'input mono', value: (first.methods ?? []).join('\n'), placeholder: '+save()' });
    methods.rows = 3;
    methods.addEventListener('input', () => {
      editor.store.patch(
        (doc) => {
          const n = doc.nodes.find((x) => x.id === first.id);
          if (n) n.methods = splitLines(methods.value);
        },
        { label: 'methods', coalesce: `methods:${first.id}` },
      );
    });
    const stereo = h('input', { class: 'input', value: first.stereotype ?? '', placeholder: 'interface, abstract…' });
    stereo.addEventListener('input', () => {
      editor.store.patch(
        (doc) => {
          const n = doc.nodes.find((x) => x.id === first.id);
          if (n) n.stereotype = stereo.value.trim() || undefined;
        },
        { label: 'stereotype', coalesce: `stereo:${first.id}` },
      );
    });
    root.append(row('Stereotype', stereo), row('Attributes', attrs), row('Methods', methods));
  }

  root.append(textControls(editor, nodes[0].text, shapeDef(first.shape).text));

  if (multi) {
    const alignRow = h('div', { class: 'btn-row' });
    const alignButtons: [string, string, Parameters<Editor['align']>[0]][] = [
      [icons.alignLeft, 'Align left', 'left'],
      [icons.alignCenterH, 'Align centres', 'hcenter'],
      [icons.alignRight, 'Align right', 'right'],
      [icons.alignTop, 'Align top', 'top'],
      [icons.alignCenterV, 'Align middles', 'vcenter'],
      [icons.alignBottom, 'Align bottom', 'bottom'],
      [icons.spaceH, 'Distribute horizontally', 'hspace'],
      [icons.spaceV, 'Distribute vertically', 'vspace'],
    ];
    for (const [icon, title, mode] of alignButtons) {
      alignRow.append(iconButton(icon, title, () => editor.align(mode)));
    }
    root.append(row('Arrange', alignRow));
  }

  if (!multi) {
    const pos = h('div', { class: 'btn-row tight' });
    for (const [key, label] of [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']] as const) {
      const input = h('input', { class: 'input num', type: 'number', value: String(Math.round(first[key])) });
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        editor.store.patch(
          (doc) => {
            const n = doc.nodes.find((x) => x.id === first.id);
            if (!n) return;
            if (key === 'w' || key === 'h') n[key] = Math.max(30, value);
            else n[key] = value;
          },
          { label: 'geometry' },
        );
      });
      pos.append(h('div', { class: 'num-field' }, h('span', { class: 'num-label', text: label }), input));
    }
    root.append(row('Position', pos));
  }

  const actions = h('div', { class: 'btn-row' });
  actions.append(
    iconButton(icons.layout, 'Shrink to fit the text', () => editor.fitSelectedSize()),
    iconButton(icons.copy, 'Duplicate (⌘D)', () => editor.duplicate()),
    iconButton(icons.trash, 'Delete (⌫)', () => editor.deleteSelection(), 'danger'),
  );
  root.append(row('Actions', actions));
}

function renderEdgeProps(root: HTMLElement, editor: Editor): void {
  const edges = editor.store.selectedEdges();
  const first = edges[0];
  if (!first) return;
  root.append(h('div', { class: 'panel-label', text: edges.length > 1 ? `${edges.length} connections` : 'Connection' }));

  if (edges.length === 1) {
    const labelInput = h('input', { class: 'input', value: first.label ?? '', placeholder: 'e.g. Yes' });
    labelInput.addEventListener('input', () => {
      editor.store.patch(
        (doc) => {
          const e = doc.edges.find((x) => x.id === first.id);
          if (e) e.label = labelInput.value || undefined;
        },
        { label: 'edge label', coalesce: `elabel:${first.id}` },
      );
    });
    root.append(row('Label', labelInput));
  }

  root.append(textControls(editor, first.text, undefined, 'Label text'));

  root.append(
    row(
      'Line',
      select<EdgeLine>(
        [
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'thick', label: 'Thick' },
        ],
        first.line,
        (v) => editor.updateSelectedEdges((e) => void (e.line = v), 'line'),
      ),
    ),
    row(
      'Route',
      select<'default' | 'orthogonal' | 'straight' | 'curved'>(
        [
          { value: 'default', label: 'Follow diagram' },
          { value: 'orthogonal', label: 'Right angles' },
          { value: 'straight', label: 'Straight' },
          { value: 'curved', label: 'Curved' },
        ],
        first.route ?? 'default',
        (v) => editor.updateSelectedEdges((e) => void (e.route = v === 'default' ? undefined : v), 'route'),
      ),
    ),
    row(
      'Start',
      select<ArrowHead>(ARROWS, first.startArrow, (v) =>
        editor.updateSelectedEdges((e) => void (e.startArrow = v), 'arrow'),
      ),
    ),
    row(
      'End',
      select<ArrowHead>(ARROWS, first.endArrow, (v) => editor.updateSelectedEdges((e) => void (e.endArrow = v), 'arrow')),
    ),
  );

  const actions = h('div', { class: 'btn-row' });
  actions.append(
    iconButton(icons.arrowRight, 'Reverse direction', () =>
      editor.updateSelectedEdges((e) => {
        const from = e.from;
        e.from = e.to;
        e.to = from;
      }, 'reverse'),
    ),
    iconButton(icons.trash, 'Delete (⌫)', () => editor.deleteSelection(), 'danger'),
  );
  root.append(row('Actions', actions));
}

function renderDiagramProps(root: HTMLElement, editor: Editor): void {
  const doc = editor.store.doc;
  root.append(h('div', { class: 'panel-label', text: 'Diagram' }));

  const nameInput = h('input', { class: 'input', value: doc.name, placeholder: 'Diagram name' });
  nameInput.addEventListener('input', () => {
    editor.store.patch((d) => void (d.name = nameInput.value), { label: 'rename', coalesce: 'rename' });
  });
  root.append(row('Name', nameInput));

  root.append(
    row(
      'Type',
      select<'flowchart' | 'class'>(
        [
          { value: 'flowchart', label: 'Flowchart' },
          { value: 'class', label: 'UML class diagram' },
        ],
        doc.kind,
        (v) => editor.store.patch((d) => void (d.kind = v), { label: 'kind' }),
      ),
    ),
    row(
      'Flow',
      select<Direction>(
        [
          { value: 'TB', label: 'Top to bottom' },
          { value: 'LR', label: 'Left to right' },
          { value: 'BT', label: 'Bottom to top' },
          { value: 'RL', label: 'Right to left' },
        ],
        doc.direction,
        (v) => {
          editor.setDirection(v);
          editor.autoLayout(v);
        },
      ),
    ),
    row(
      'Connections',
      select<'orthogonal' | 'straight' | 'curved'>(
        [
          { value: 'orthogonal', label: 'Right angles' },
          { value: 'straight', label: 'Straight' },
          { value: 'curved', label: 'Curved' },
        ],
        editor.store.prefs.route,
        (v) => {
          editor.store.setPrefs({ route: v });
          editor.store.patch(
            (d) => {
              for (const e of d.edges) e.route = v;
            },
            { label: 'routes' },
          );
        },
      ),
    ),
  );

  const toggles = h('div', { class: 'btn-row' });
  toggles.append(
    h('button', {
      class: `btn toggle ${editor.store.prefs.grid ? 'active' : ''}`,
      type: 'button',
      html: `${icons.grid}<span>Grid</span>`,
      on: {
        click: () => {
          editor.store.setPrefs({ grid: !editor.store.prefs.grid });
          editor.render();
        },
      },
    }),
    h('button', {
      class: `btn toggle ${editor.store.prefs.snap ? 'active' : ''}`,
      type: 'button',
      html: `${icons.check}<span>Snap</span>`,
      on: { click: () => editor.store.setPrefs({ snap: !editor.store.prefs.snap }) },
    }),
  );
  root.append(row('Canvas', toggles));

  root.append(
    h(
      'div',
      { class: 'stats' },
      h('span', { text: `${doc.nodes.length} shape${doc.nodes.length === 1 ? '' : 's'}` }),
      h('span', { text: `${doc.edges.length} connection${doc.edges.length === 1 ? '' : 's'}` }),
    ),
    h('p', { class: 'palette-hint', text: 'Select a shape or connection to edit it. Nothing selected shows diagram-wide settings.' }),
  );
}

/**
 * Type settings, shared by nodes and edge labels. Values shown are the
 * resolved ones, so an unset field still displays what you actually see.
 */
function textControls(
  editor: Editor,
  style: TextStyle | undefined,
  shapeDefault: TextStyle | undefined,
  heading = 'Text',
): HTMLElement {
  const resolved = resolveText(style, shapeDefault ? { text: shapeDefault } as never : undefined);
  const wrap = h('div', { class: 'text-controls' });

  const fonts = (Object.keys(FONT_LABELS) as TextFont[]).map((f) => ({ value: f, label: FONT_LABELS[f] }));
  const fontSelect = select<TextFont>(fonts, resolved.font, (v) => editor.updateTextStyle({ font: v }));

  const size = h('input', {
    class: 'input num',
    type: 'number',
    value: String(Math.round(resolved.size)),
    attrs: { min: MIN_FONT_SIZE, max: MAX_FONT_SIZE, step: 1 },
  });
  size.addEventListener('change', () => {
    const value = Number(size.value);
    if (Number.isFinite(value)) editor.updateTextStyle({ size: value });
  });

  const toggle = (icon: string, title: string, on: boolean, patch: Partial<TextStyle>) =>
    h('button', {
      class: `btn icon ${on ? 'active' : ''}`,
      type: 'button',
      title,
      html: icon,
      on: { click: () => editor.updateTextStyle(patch) },
    });

  const alignButton = (icon: string, title: string, on: boolean, patch: Partial<TextStyle>) =>
    toggle(icon, title, on, patch);

  wrap.append(
    h('div', { class: 'field-control' }, fontSelect, h('div', { class: 'num-field compact' }, size)),
    h(
      'div',
      { class: 'btn-row tight' },
      toggle(icons.bold, 'Bold', resolved.weight >= 700, { bold: resolved.weight < 700 }),
      toggle(icons.italic, 'Italic', resolved.italic, { italic: !resolved.italic }),
      toggle(icons.underline, 'Underline', resolved.underline, { underline: !resolved.underline }),
      toggle(icons.uppercase, 'Upper case', resolved.uppercase, { uppercase: !resolved.uppercase }),
    ),
    h(
      'div',
      { class: 'btn-row tight' },
      alignButton(icons.alignTextLeft, 'Align left', resolved.align === 'left', { align: 'left' }),
      alignButton(icons.alignTextCenter, 'Align centre', resolved.align === 'center', { align: 'center' }),
      alignButton(icons.alignTextRight, 'Align right', resolved.align === 'right', { align: 'right' }),
      h('span', { class: 'control-gap' }),
      alignButton(icons.alignTop, 'Top', resolved.valign === 'top', { valign: 'top' }),
      alignButton(icons.alignCenterV, 'Middle', resolved.valign === 'middle', { valign: 'middle' }),
      alignButton(icons.alignBottom, 'Bottom', resolved.valign === 'bottom', { valign: 'bottom' }),
    ),
    textColours(editor, style?.color),
  );
  return h('div', { class: 'field' }, h('label', { class: 'field-label', text: heading }), wrap);
}

function textColours(editor: Editor, current: string | undefined): HTMLElement {
  const theme = themeFor(editor.store.prefs.theme);
  const swatches = h('div', { class: 'swatches' });
  swatches.append(
    h('button', {
      class: `swatch auto ${current ? '' : 'active'}`,
      type: 'button',
      title: 'Follow the shape',
      on: { click: () => editor.updateTextStyle({ color: undefined }) },
    }),
  );
  for (const key of PALETTE_KEYS) {
    const entry = theme.palette[key];
    swatches.append(
      h('button', {
        class: `swatch ${current === key ? 'active' : ''}`,
        type: 'button',
        title: `${entry.name} text`,
        style: { background: entry.stroke, borderColor: entry.stroke },
        on: { click: () => editor.updateTextStyle({ color: key }) },
      }),
    );
  }
  return swatches;
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
