type Child = Node | string | number | false | null | undefined;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  id?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  attrs?: Record<string, string | number | boolean | undefined>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
}

/** Minimal element builder — enough structure for a UI this size, no framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  if (props.id) el.id = props.id;
  if (props.type) el.setAttribute('type', props.type);
  if (props.value !== undefined) (el as HTMLInputElement).value = props.value;
  if (props.placeholder) (el as HTMLInputElement).placeholder = props.placeholder;
  if (props.disabled !== undefined) (el as HTMLButtonElement).disabled = props.disabled;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  Object.assign(el.style, props.style ?? {});
  for (const [name, fn] of Object.entries(props.on ?? {})) {
    el.addEventListener(name, fn as EventListener);
  }
  append(el, children);
  return el;
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children.flat()) {
    if (child === false || child === null || child === undefined) continue;
    parent.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function button(label: string, onClick: () => void, props: Props = {}): HTMLButtonElement {
  return h(
    'button',
    { ...props, class: `btn ${props.class ?? ''}`.trim(), type: 'button', on: { click: onClick } },
    props.html ? undefined : label,
  );
}

export function iconButton(icon: string, title: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', {
    class: `btn icon ${cls}`.trim(),
    title,
    type: 'button',
    html: icon,
    attrs: { 'aria-label': title },
    on: { click: onClick },
  });
}

export function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function select<T extends string>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
  props: Props = {},
): HTMLSelectElement {
  const el = h('select', { ...props, class: `input ${props.class ?? ''}`.trim() });
  for (const opt of options) {
    const o = h('option', { value: opt.value, text: opt.label });
    if (opt.value === value) o.selected = true;
    el.append(o);
  }
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}
