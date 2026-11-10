import { h } from './dom';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  hint?: string;
}

/** Lightweight popover menu anchored under a trigger button. */
export function attachMenu(trigger: HTMLElement, items: () => MenuItem[]): void {
  let open: HTMLElement | null = null;
  const close = () => {
    open?.remove();
    open = null;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };
  const onOutside = (e: PointerEvent) => {
    if (open && !open.contains(e.target as Node) && !trigger.contains(e.target as Node)) close();
  };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) return close();
    const rect = trigger.getBoundingClientRect();
    const menu = h('div', { class: 'menu' });
    for (const item of items()) {
      menu.append(
        h(
          'button',
          {
            class: 'menu-item',
            type: 'button',
            on: {
              click: () => {
                close();
                item.onSelect();
              },
            },
          },
          h('span', { text: item.label }),
          item.hint ? h('span', { class: 'menu-hint', text: item.hint }) : undefined,
        ),
      );
    }
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    document.body.append(menu);
    open = menu;
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  });
}
