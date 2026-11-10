import { h, iconButton } from './dom';
import { icons } from './icons';

export interface Modal {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

export function openModal(title: string, build: (modal: Modal) => void, width = 520): Modal {
  const body = h('div', { class: 'modal-body' });
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const modal: Modal = { el: backdrop, body, close };
  const dialog = h(
    'div',
    { class: 'modal', style: { maxWidth: `${width}px` }, attrs: { role: 'dialog', 'aria-modal': 'true' } },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', { text: title }),
      iconButton(icons.close, 'Close', close),
    ),
    body,
  );
  backdrop.append(dialog);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  build(modal);
  return modal;
}
