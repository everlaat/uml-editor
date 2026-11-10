import { h } from './dom';

let host: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 2600): void {
  if (!host) {
    host = h('div', { class: 'toasts' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast ${kind}`, text: message });
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
  }, ms);
}
