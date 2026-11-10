import type { Diagram } from '../core/model';
import { parseMermaid } from '../mermaid/parse';
import { layoutDiagram, resolveOverlaps } from '../core/layout';
import { fitNodeSize } from '../render/shapes';
import { generateFromPrompt } from './heuristic';
import { complete, ensureEngine, type ProgressInfo } from './webllm';

export type GeneratorMode = 'offline' | 'local-model';

export interface GenerateResult {
  diagram: Diagram;
  mermaid: string;
  source: 'offline' | 'local-model';
  note?: string;
}

const SYSTEM_PROMPT = `You convert descriptions into Mermaid diagram code.
Rules:
- Reply with Mermaid code ONLY. No prose, no backticks, no explanation.
- Use "flowchart TD" for processes and "classDiagram" for data models or class structures.
- Node ids are short alphanumeric tokens; put the human text in brackets: step1["Validate payment"].
- Shapes: ["process"], ("rounded"), (["start or end"]), {"decision"}, [("database")], [/"input"/].
- Label decision branches: dec -->|Yes| next
- Keep it under 18 nodes. Every node must be connected.`;

const EXAMPLE = `Description: user signs in, if the password is wrong show an error, otherwise open the dashboard
Mermaid:
flowchart TD
    start(["Start"]) --> signIn["User signs in"]
    signIn --> check{"Password correct?"}
    check -->|No| error["Show error"]
    error --> signIn
    check -->|Yes| dash["Open dashboard"]
    dash --> done(["End"])`;

/** Offline generator: instant, deterministic, no download. */
export function generateOffline(prompt: string): GenerateResult {
  const diagram = generateFromPrompt(prompt);
  return { diagram, mermaid: '', source: 'offline' };
}

export interface LocalModelOptions {
  modelId: string;
  onProgress?: (p: ProgressInfo) => void;
  onStatus?: (text: string) => void;
}

/**
 * Local-model generator. Falls back to the offline generator when the model
 * cannot produce diagram code we can parse, so the button always does something.
 */
export async function generateWithLocalModel(prompt: string, opts: LocalModelOptions): Promise<GenerateResult> {
  await ensureEngine(opts.modelId, opts.onProgress);
  opts.onStatus?.('Thinking…');
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? `${EXAMPLE}\n\nDescription: ${prompt}\nMermaid:`
        : `${EXAMPLE}\n\nDescription: ${prompt}\nMermaid:\nYour previous answer failed to parse with: ${lastError}\nReturn corrected Mermaid code only.`;
    const raw = await complete(SYSTEM_PROMPT, user, { maxTokens: 800, temperature: attempt === 0 ? 0.2 : 0.35 });
    const code = extractMermaid(raw);
    if (!code) {
      lastError = 'no mermaid code found in the reply';
      continue;
    }
    const parsed = parseMermaid(code);
    if (parsed.diagram && parsed.diagram.nodes.length > 1) {
      const diagram = parsed.diagram;
      for (const n of diagram.nodes) {
        const fit = fitNodeSize(n);
        n.w = fit.w;
        n.h = fit.h;
      }
      layoutDiagram(diagram);
      resolveOverlaps(diagram);
      return { diagram, mermaid: code, source: 'local-model' };
    }
    lastError = parsed.errors[0]?.message ?? 'the diagram had too few nodes';
  }
  const fallback = generateOffline(prompt);
  return {
    ...fallback,
    note: `The local model did not return usable Mermaid (${lastError}). Showing the offline draft instead.`,
  };
}

/** Pull mermaid out of a reply that may contain fences or chatter. */
export function extractMermaid(raw: string): string | null {
  const text = raw.replace(/<\/?think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = /```(?:mermaid)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fence ? fence[1] : text).trim();
  const lines = body.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^\s*(flowchart|graph|classDiagram)\b/i.test(l));
  if (startIdx === -1) return null;
  const out: string[] = [];
  for (const line of lines.slice(startIdx)) {
    if (/^\s*(```|Explanation|Note:|This diagram)/i.test(line)) break;
    out.push(line);
  }
  const code = out.join('\n').trim();
  return code || null;
}
