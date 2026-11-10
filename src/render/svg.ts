export const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVGNS, tag);
  setAttrs(node, attrs);
  return node;
}

export function setAttrs(node: Element, attrs: Record<string, string | number | undefined>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) node.removeAttribute(key);
    else {
      const next = String(value);
      if (node.getAttribute(key) !== next) node.setAttribute(key, next);
    }
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
