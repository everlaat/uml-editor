/**
 * Optional in-browser LLM, loaded on demand from a CDN and run on WebGPU via
 * MLC WebLLM. Nothing is downloaded until the user asks for it, and once a
 * model is cached it works offline. The heuristic generator covers everyone
 * else, so this stays strictly opt-in.
 */

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.88';

export interface ModelChoice {
  id: string;
  label: string;
  /** Approximate VRAM / download footprint in MB, as reported by WebLLM. */
  sizeMB?: number;
}

/**
 * The only vision-capable models WebLLM ships. They are large, so they are
 * offered solely when there is actually an image to read.
 */
export const VISION_MODELS = [
  'Phi-3.5-vision-instruct-q4f16_1-MLC',
  'Phi-3.5-vision-instruct-q4f32_1-MLC',
];

export const DEFAULT_VISION_MODEL = VISION_MODELS[0];

export function isVisionModel(modelId: string): boolean {
  return /vision|vlm/i.test(modelId);
}

/** Shown first, if present in the runtime's prebuilt list. */
const PREFERRED = [
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
];

export const DEFAULT_MODEL = PREFERRED[0];

export interface ProgressInfo {
  text: string;
  progress: number;
}

type AnyEngine = {
  chat: {
    completions: {
      create(opts: Record<string, unknown>): Promise<{ choices: { message: { content?: string } }[] }>;
    };
  };
  unload?: () => Promise<void>;
};

type WebLLMModule = {
  CreateMLCEngine(
    model: string,
    opts: { initProgressCallback?: (r: { text: string; progress: number }) => void },
  ): Promise<AnyEngine>;
  prebuiltAppConfig: { model_list: { model_id: string; vram_required_MB?: number }[] };
  hasModelInCache?: (modelId: string) => Promise<boolean>;
};

let modulePromise: Promise<WebLLMModule> | null = null;
let engine: AnyEngine | null = null;
let engineModel: string | null = null;
let loading: Promise<void> | null = null;

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Headless and virtualised browsers expose `navigator.gpu` with no usable
 * adapter behind it, so ask for the adapter before promising anything.
 */
export async function webgpuUsable(): Promise<boolean> {
  if (!webgpuAvailable()) return false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

async function loadModule(): Promise<WebLLMModule> {
  modulePromise ??= import(/* @vite-ignore */ WEBLLM_URL) as Promise<WebLLMModule>;
  try {
    return await modulePromise;
  } catch (err) {
    modulePromise = null;
    throw new Error(
      `Could not load the local model runtime (${(err as Error).message}). It is fetched from a CDN the first time only.`,
    );
  }
}

export async function listModels(kind: 'text' | 'vision' = 'text'): Promise<ModelChoice[]> {
  const mod = await loadModule();
  const all = mod.prebuiltAppConfig?.model_list ?? [];
  const byId = new Map(all.map((m) => [m.model_id, m]));
  const picked: ModelChoice[] = [];
  for (const id of kind === 'vision' ? VISION_MODELS : PREFERRED) {
    const m = byId.get(id);
    if (m) picked.push({ id, label: prettyName(id), sizeMB: m.vram_required_MB });
  }
  if (kind === 'vision') {
    if (picked.length) return picked;
    return all
      .filter((m) => isVisionModel(m.model_id))
      .map((m) => ({ id: m.model_id, label: prettyName(m.model_id), sizeMB: m.vram_required_MB }));
  }
  if (picked.length) return picked;
  // Fallback: anything small enough to be plausible in a browser tab.
  return all
    .filter((m) => (m.vram_required_MB ?? 99999) < 4500 && m.model_id.includes('q4f16'))
    .slice(0, 8)
    .map((m) => ({ id: m.model_id, label: prettyName(m.model_id), sizeMB: m.vram_required_MB }));
}

export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const mod = await loadModule();
    return (await mod.hasModelInCache?.(modelId)) ?? false;
  } catch {
    return false;
  }
}

function prettyName(id: string): string {
  return id
    .replace(/-q4f16_1-MLC.*$/, '')
    .replace(/-q4f32_1-MLC.*$/, '')
    .replace(/-MLC$/, '')
    .replace(/-Instruct/, ' Instruct');
}

export function loadedModel(): string | null {
  return engineModel;
}

export async function ensureEngine(modelId: string, onProgress?: (p: ProgressInfo) => void): Promise<void> {
  if (engine && engineModel === modelId) return;
  if (loading) await loading.catch(() => undefined);
  if (engine && engineModel === modelId) return;
  if (!webgpuAvailable()) {
    throw new Error('This browser has no WebGPU, which the local model needs. Chrome or Edge 113+ works; Safari 18+ on recent macOS also works.');
  }
  loading = (async () => {
    const mod = await loadModule();
    if (engine?.unload) await engine.unload().catch(() => undefined);
    engine = await mod.CreateMLCEngine(modelId, {
      initProgressCallback: (r) => onProgress?.({ text: r.text, progress: r.progress }),
    });
    engineModel = modelId;
  })();
  try {
    await loading;
  } finally {
    loading = null;
  }
}

export async function complete(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!engine) throw new Error('The local model is not loaded yet.');
  const res = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 700,
  });
  return res.choices?.[0]?.message?.content ?? '';
}

/**
 * Ask a vision model about an image. WebLLM wants the picture as a data URL in
 * a content part; Phi-3.5-vision expects the image ahead of the question, and
 * takes no system message, so the instructions ride along with it.
 */
export async function completeWithImage(
  instruction: string,
  imageDataUrl: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!engine) throw new Error('The local model is not loaded yet.');
  if (!imageDataUrl.startsWith('data:image')) throw new Error('The image could not be read.');
  try {
    const res = await engine.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: instruction },
          ],
        },
      ],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 700,
    });
    return res.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (/image adapter|image_url|not support/i.test(message)) {
      throw new Error(`${engineModel ?? 'That model'} cannot read images. Pick a vision model and try again.`);
    }
    throw err;
  }
}

export async function unload(): Promise<void> {
  if (engine?.unload) await engine.unload().catch(() => undefined);
  engine = null;
  engineModel = null;
}
