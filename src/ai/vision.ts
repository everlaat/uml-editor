/** Turning an uploaded picture of a diagram into something a VLM can read. */

export interface PreparedImage {
  /** `data:image/...;base64,...`, which is what WebLLM accepts. */
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
}

/** Longest side the image is scaled to before it goes to the model. */
export const MAX_IMAGE_SIDE = 768;
/** Refuse absurd uploads early rather than hanging the tab. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

/** Scale to fit `maxSide` without enlarging small images. */
export function planResize(width: number, height: number, maxSide = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width: 1, height: 1 };
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImageFile(file: File | null | undefined): file is File {
  return !!file && file.type.startsWith('image/');
}

/**
 * Decode, downscale and re-encode an upload. Everything stays in the tab; the
 * result is a data URL because that is the only form WebLLM takes.
 */
export async function prepareImage(file: File, maxSide = MAX_IMAGE_SIDE): Promise<PreparedImage> {
  if (!isImageFile(file)) throw new Error('That file is not an image.');
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(0)} MB — please use one under 25 MB.`);
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be decoded. PNG, JPEG, WebP and GIF work.');
  });
  const { width, height } = planResize(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give us a canvas to resize the image with.');
  // Photos of whiteboards benefit from a white backing where the source is transparent.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return {
    dataUrl,
    name: file.name || 'image',
    width,
    height,
    bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
  };
}

export const IMAGE_INSTRUCTION = `This image shows a diagram: a flowchart, a sketch on a whiteboard, or a class diagram.
Write it out as Mermaid code.
Rules:
- Reply with Mermaid code ONLY. No prose, no backticks.
- Start with "flowchart TD" for a process, or "classDiagram" for classes and fields.
- Give each box a short id and put its text in brackets: step1["Collect payment"].
- A diamond is a decision: dec{"Approved?"}. A rounded box is a start or end: s(["Start"]).
- Label the arrows that are labelled in the picture: dec -->|Yes| step2
- Copy the words in the picture as closely as you can read them. Do not invent extra steps.`;

/** Nudge used on the retry when the first reply did not parse. */
export function repairInstruction(problem: string): string {
  return `${IMAGE_INSTRUCTION}

Your previous answer could not be parsed: ${problem}
Return corrected Mermaid code only, starting with "flowchart TD" or "classDiagram".`;
}
