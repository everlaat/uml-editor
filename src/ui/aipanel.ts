import type { Editor } from '../editor';
import { generateOffline, generateWithLocalModel, type GenerateResult } from '../ai/generate';
import { DEFAULT_MODEL, isModelCached, listModels, loadedModel, unload, webgpuUsable } from '../ai/webllm';
import { button, clearChildren, h } from './dom';
import { toast } from './toast';

const EXAMPLES = [
  'Customer places an order. Check stock. If in stock, charge the card, then pack and ship it. Otherwise notify the customer and cancel.',
  'User opens the app, signs in. If the password is wrong show an error and go back to sign in. Otherwise load the dashboard.',
  'CI pipeline: lint, run unit tests, build the image, push to the registry, deploy to staging, run smoke tests, promote to production.',
  'Classes: Order has fields id, total, status. Order has many OrderLine. OrderLine belongs to Product. Customer has one Address. PremiumCustomer extends Customer.',
];

export function createAiPanel(editor: Editor): HTMLElement {
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

  const status = h('div', { class: 'ai-status' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
  bar.style.display = 'none';
  const fill = bar.firstElementChild as HTMLElement;

  const modeWrap = h('div', { class: 'seg' });
  let mode: 'offline' | 'local-model' = 'offline';
  const modelRow = h('div', { class: 'field' });

  const setMode = (next: 'offline' | 'local-model') => {
    mode = next;
    for (const btn of modeWrap.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.mode === next);
    }
    modelRow.style.display = next === 'local-model' ? '' : 'none';
    if (next === 'local-model') void populateModels();
  };

  for (const [value, label, title] of [
    ['offline', 'Instant', 'Built-in rule-based generator. No download, works offline.'],
    ['local-model', 'Local model', 'Runs a small language model in this tab with WebGPU. One-time download.'],
  ] as const) {
    const btn = h('button', { class: 'seg-btn', type: 'button', text: label, title, on: { click: () => setMode(value) } });
    btn.dataset.mode = value;
    modeWrap.append(btn);
  }

  const modelSelect = h('select', { class: 'input' });
  let modelsLoaded = false;
  const populateModels = async () => {
    if (modelsLoaded) return;
    status.textContent = 'Checking this browser for WebGPU…';
    if (!(await webgpuUsable())) {
      status.textContent =
        'No usable WebGPU device here, so the local model cannot run. Chrome/Edge 113+ or Safari 18+ on hardware with a GPU can. “Instant” still works.';
      status.className = 'ai-status warn';
      modelSelect.disabled = true;
      return;
    }
    modelSelect.disabled = false;
    status.textContent = 'Fetching the model list…';
    try {
      const models = await listModels();
      clearChildren(modelSelect);
      for (const m of models) {
        const size = m.sizeMB ? ` · ~${(m.sizeMB / 1024).toFixed(1)} GB` : '';
        const opt = h('option', { value: m.id, text: `${m.label}${size}` });
        if (m.id === (editor.store.prefs.llmModel ?? DEFAULT_MODEL)) opt.selected = true;
        modelSelect.append(opt);
      }
      modelsLoaded = true;
      await describeCache();
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = 'ai-status warn';
    }
  };
  modelSelect.addEventListener('change', () => {
    editor.store.setPrefs({ llmModel: modelSelect.value });
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
    status.textContent = cached
      ? 'Already downloaded — it will load from this browser’s cache.'
      : 'First run downloads the weights into this browser’s cache, then it works offline.';
    status.className = 'ai-status';
  };

  modelRow.append(
    h('label', { class: 'field-label', text: 'Model' }),
    h('div', { class: 'field-control' }, modelSelect),
  );
  modelRow.style.display = 'none';

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

  let busy = false;
  const generateBtn = button('Generate', () => void run('replace'), { class: 'primary' });
  const addBtn = button('Add to diagram', () => void run('merge'));

  const run = async (how: 'replace' | 'merge') => {
    const text = prompt.value.trim();
    if (!text) {
      toast('Describe the diagram first', 'error');
      return;
    }
    if (busy) return;
    busy = true;
    generateBtn.disabled = true;
    addBtn.disabled = true;
    try {
      let result: GenerateResult;
      if (mode === 'offline') {
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
        toast('Could not find any steps in that description', 'error');
        return;
      }
      if (how === 'merge') editor.mergeDiagram(result.diagram, 'generate');
      else {
        result.diagram.name = editor.store.doc.name || result.diagram.name;
        editor.applyDiagram(result.diagram, { preservePositions: false, label: 'generate' });
        editor.fit();
      }
      status.textContent = result.note ?? `Drew ${result.diagram.nodes.length} shapes with the ${result.source === 'offline' ? 'instant' : 'local model'} generator.`;
      status.className = result.note ? 'ai-status warn' : 'ai-status ok';
      if (result.note) toast(result.note, 'error', 5000);
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = 'ai-status warn';
      toast((err as Error).message, 'error', 5000);
    } finally {
      busy = false;
      generateBtn.disabled = false;
      addBtn.disabled = false;
      bar.style.display = 'none';
    }
  };

  const unloadBtn = button('Unload model', () => {
    void unload().then(() => {
      status.textContent = 'Model unloaded. The download stays cached.';
      status.className = 'ai-status';
    });
  });

  setMode('offline');

  return h(
    'div',
    { class: 'ai-panel' },
    h('div', { class: 'panel-label', text: 'Describe a diagram' }),
    prompt,
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
      text: 'Everything runs in this tab. “Instant” is a rule-based reader of your words; “Local model” downloads a small LLM once and then works offline too.',
    }),
    h('div', { class: 'btn-row' }, unloadBtn),
  );
}
