import type { Editor } from '../editor';
import { generateFromImage, generateOffline, generateWithLocalModel, type GenerateResult } from '../ai/generate';
import {
  DEFAULT_MODEL,
  DEFAULT_VISION_MODEL,
  isModelCached,
  listModels,
  loadedModel,
  unload,
  webgpuUsable,
} from '../ai/webllm';
import { ACCEPTED_TYPES, isImageFile, prepareImage, type PreparedImage } from '../ai/vision';
import { button, clearChildren, h } from './dom';
import { icons } from './icons';
import { toast } from './toast';

const EXAMPLES = [
  'Customer places an order. Check stock. If in stock, charge the card, then pack and ship it. Otherwise notify the customer and cancel.',
  'User opens the app, signs in. If the password is wrong show an error and go back to sign in. Otherwise load the dashboard.',
  'CI pipeline: lint, run unit tests, build the image, push to the registry, deploy to staging, run smoke tests, promote to production.',
  'Classes: Order has fields id, total, status. Order has many OrderLine. OrderLine belongs to Product. Customer has one Address. PremiumCustomer extends Customer.',
];

export interface AiPanel {
  el: HTMLElement;
  /** Attach an image from elsewhere in the app (a drop on the canvas). */
  attachImage: (file: File) => Promise<void>;
}

export function createAiPanel(editor: Editor): AiPanel {
  let mode: 'offline' | 'local-model' = 'offline';
  /** What the generator was set to before a picture took over. */
  let modeBeforeImage: 'offline' | 'local-model' = 'offline';
  let image: PreparedImage | null = null;
  let busy = false;

  // --------------------------------------------------------------- prompt
  const prompt = h('textarea', {
    class: 'input prompt',
    placeholder: 'Describe the flow in plain words, one step at a time…',
  });
  prompt.rows = 5;
  prompt.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void run('replace');
    }
  });

  // ---------------------------------------------------------------- image
  const dropzone = h(
    'button',
    {
      class: 'dropzone',
      type: 'button',
      title: 'Read a diagram out of a picture',
      on: {
        click: () => fileInput.click(),
        dragover: (e) => {
          e.preventDefault();
          dropzone.classList.add('over');
        },
        dragleave: () => dropzone.classList.remove('over'),
        drop: (e) => {
          e.preventDefault();
          dropzone.classList.remove('over');
          const file = (e as DragEvent).dataTransfer?.files?.[0];
          if (file) void attachImage(file);
        },
      },
    },
    h('span', { class: 'dropzone-icon', html: icons.upload }),
    h('span', { text: 'Drop a picture of a diagram, or click to choose' }),
  );
  const fileInput = h('input', { type: 'file', attrs: { accept: ACCEPTED_TYPES } });
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void attachImage(file);
  });

  const preview = h('div', { class: 'image-preview' });
  preview.style.display = 'none';

  const attachImage = async (file: File): Promise<void> => {
    if (!isImageFile(file)) {
      toast('That file is not an image', 'error');
      return;
    }
    try {
      if (!image) modeBeforeImage = mode;
      image = await prepareImage(file);
      renderPreview();
      setMode('local-model');
    } catch (err) {
      toast((err as Error).message, 'error', 4500);
    }
  };

  const clearImage = () => {
    image = null;
    renderPreview();
    setMode(modeBeforeImage);
  };

  const renderPreview = () => {
    clearChildren(preview);
    if (!image) {
      preview.style.display = 'none';
      dropzone.style.display = '';
      return;
    }
    preview.style.display = '';
    dropzone.style.display = 'none';
    const img = h('img', { class: 'thumb', attrs: { src: image.dataUrl, alt: image.name } });
    preview.append(
      img,
      h(
        'div',
        { class: 'image-meta' },
        h('span', { class: 'image-name', text: image.name }),
        h('span', { class: 'image-dims', text: `${image.width}×${image.height} · ${(image.bytes / 1024).toFixed(0)} KB` }),
      ),
      h('button', { class: 'btn icon', type: 'button', title: 'Remove the image', html: icons.close, on: { click: clearImage } }),
    );
    syncActions();
  };

  // Paste an image straight into the panel.
  const onPaste = (e: ClipboardEvent) => {
    const file = [...(e.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .find(Boolean);
    if (file) {
      e.preventDefault();
      void attachImage(file);
    }
  };
  prompt.addEventListener('paste', onPaste);
  dropzone.addEventListener('paste', onPaste);

  // ------------------------------------------------------------ generator
  const status = h('div', { class: 'ai-status' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
  bar.style.display = 'none';
  const fill = bar.firstElementChild as HTMLElement;

  const modeWrap = h('div', { class: 'seg' });
  const modelSelect = h('select', { class: 'input' });
  const modelRow = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field-label', text: 'Model' }),
    h('div', { class: 'field-control' }, modelSelect),
  );

  const setMode = (next: 'offline' | 'local-model') => {
    mode = image ? 'local-model' : next;
    for (const btn of modeWrap.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.disabled = !!image;
      btn.title = image
        ? 'Reading a picture needs the local vision model'
        : btn.dataset.mode === 'offline'
          ? 'Built-in rule-based generator. No download, works offline.'
          : 'Runs a small language model in this tab with WebGPU. One-time download.';
    }
    modelRow.style.display = mode === 'local-model' ? '' : 'none';
    if (mode === 'local-model') void populateModels();
    syncActions();
  };

  for (const [value, label] of [
    ['offline', 'Instant'],
    ['local-model', 'Local model'],
  ] as const) {
    const btn = h('button', { class: 'seg-btn', type: 'button', text: label, on: { click: () => setMode(value) } });
    btn.dataset.mode = value;
    modeWrap.append(btn);
  }

  let listedKind: 'text' | 'vision' | null = null;
  const populateModels = async () => {
    const kind = image ? 'vision' : 'text';
    if (listedKind === kind) return;
    status.className = 'ai-status';
    status.textContent = 'Checking this browser for WebGPU…';
    if (!(await webgpuUsable())) {
      status.textContent = image
        ? 'Reading a picture needs WebGPU, which this browser does not have. Chrome/Edge 113+ or Safari 18+ on a machine with a GPU can do it.'
        : 'No usable WebGPU device here, so the local model cannot run. “Instant” still works.';
      status.className = 'ai-status warn';
      modelSelect.disabled = true;
      // An empty, dead dropdown helps nobody.
      modelRow.style.display = 'none';
      return;
    }
    modelSelect.disabled = false;
    modelRow.style.display = '';
    status.textContent = 'Fetching the model list…';
    try {
      const models = await listModels(kind);
      clearChildren(modelSelect);
      const preferred = image ? DEFAULT_VISION_MODEL : (editor.store.prefs.llmModel ?? DEFAULT_MODEL);
      for (const m of models) {
        const size = m.sizeMB ? ` · ~${(m.sizeMB / 1024).toFixed(1)} GB` : '';
        const opt = h('option', { value: m.id, text: `${m.label}${size}` });
        if (m.id === preferred) opt.selected = true;
        modelSelect.append(opt);
      }
      listedKind = kind;
      await describeCache();
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = 'ai-status warn';
    }
  };
  modelSelect.addEventListener('change', () => {
    if (!image) editor.store.setPrefs({ llmModel: modelSelect.value });
    void describeCache();
  });

  const describeCache = async () => {
    const id = modelSelect.value;
    if (!id) return;
    if (loadedModel() === id) {
      status.textContent = 'Model loaded and ready.';
      status.className = 'ai-status ok';
      return;
    }
    const cached = await isModelCached(id);
    status.className = 'ai-status';
    status.textContent = cached
      ? 'Already downloaded — it will load from this browser’s cache.'
      : image
        ? 'The vision model is a big first download (a few GB). It is cached afterwards and then works offline.'
        : 'First run downloads the weights into this browser’s cache, then it works offline.';
  };

  // -------------------------------------------------------------- actions
  const generateBtn = button('Generate', () => void run('replace'), { class: 'primary' });
  const addBtn = button('Add to diagram', () => void run('merge'));

  const syncActions = () => {
    generateBtn.textContent = image ? 'Read the image' : 'Generate';
    generateBtn.disabled = busy;
    addBtn.disabled = busy;
  };

  const run = async (how: 'replace' | 'merge') => {
    if (busy) return;
    const text = prompt.value.trim();
    if (!image && !text) {
      toast('Describe the diagram, or drop in a picture of one', 'error');
      return;
    }
    busy = true;
    syncActions();
    try {
      let result: GenerateResult;
      if (image) {
        bar.style.display = '';
        fill.style.width = '0%';
        status.className = 'ai-status';
        result = await generateFromImage(image, {
          modelId: modelSelect.value || DEFAULT_VISION_MODEL,
          onProgress: (p) => {
            fill.style.width = `${Math.round((p.progress || 0) * 100)}%`;
            status.textContent = p.text;
          },
          onStatus: (t) => {
            status.textContent = t;
          },
        });
      } else if (mode === 'offline') {
        result = generateOffline(text);
      } else {
        bar.style.display = '';
        fill.style.width = '0%';
        status.className = 'ai-status';
        result = await generateWithLocalModel(text, {
          modelId: modelSelect.value || DEFAULT_MODEL,
          onProgress: (p) => {
            fill.style.width = `${Math.round((p.progress || 0) * 100)}%`;
            status.textContent = p.text;
          },
          onStatus: (t) => {
            status.textContent = t;
          },
        });
      }
      if (!result.diagram.nodes.length) {
        toast('Nothing recognisable came back', 'error');
        return;
      }
      if (how === 'merge') editor.mergeDiagram(result.diagram, 'generate');
      else {
        result.diagram.name = editor.store.doc.name || result.diagram.name;
        editor.applyDiagram(result.diagram, { preservePositions: false, label: 'generate' });
        editor.fit();
      }
      const what = `${result.diagram.nodes.length} shape${result.diagram.nodes.length === 1 ? '' : 's'}`;
      const how2 =
        result.source === 'offline' ? 'instant generator' : result.source === 'image' ? 'picture' : 'local model';
      status.textContent = result.note ?? `Drew ${what} from the ${how2}.`;
      status.className = result.note ? 'ai-status warn' : 'ai-status ok';
      if (result.note) toast(result.note, 'error', 5000);
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = 'ai-status warn';
      toast((err as Error).message, 'error', 6000);
    } finally {
      busy = false;
      syncActions();
      bar.style.display = 'none';
    }
  };

  const chips = h('div', { class: 'chips' });
  for (const example of EXAMPLES) {
    chips.append(
      h('button', {
        class: 'chip',
        type: 'button',
        text: example.length > 46 ? `${example.slice(0, 44)}…` : example,
        title: example,
        on: {
          click: () => {
            prompt.value = example;
            prompt.focus();
          },
        },
      }),
    );
  }

  const el = h(
    'div',
    { class: 'ai-panel' },
    h('div', { class: 'panel-label', text: 'Describe a diagram' }),
    prompt,
    h('div', { class: 'panel-label', text: 'Or read one from a picture' }),
    dropzone,
    preview,
    fileInput,
    h('div', { class: 'btn-row' }, generateBtn, addBtn),
    h('div', { class: 'panel-label', text: 'Generator' }),
    modeWrap,
    modelRow,
    bar,
    status,
    h('div', { class: 'panel-label', text: 'Try one' }),
    chips,
    h('p', {
      class: 'palette-hint',
      text: 'Everything runs in this tab and nothing is uploaded. “Instant” reads your words with rules and no download; “Local model” and picture-reading download a model once, then work offline.',
    }),
    h('div', { class: 'btn-row' }, button('Unload model', () => {
      void unload().then(() => {
        status.textContent = 'Model unloaded. The download stays cached.';
        status.className = 'ai-status';
      });
    })),
  );

  setMode('offline');
  syncActions();
  return { el, attachImage };
}
