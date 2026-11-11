const wrap = (body: string, stroke = true): string =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="${stroke ? 'none' : 'currentColor'}" stroke="${
    stroke ? 'currentColor' : 'none'
  }" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  undo: wrap('<path d="M4 9h11a5 5 0 0 1 0 10H9"/><path d="M8 5 4 9l4 4"/>'),
  redo: wrap('<path d="M20 9H9a5 5 0 0 0 0 10h6"/><path d="M16 5l4 4-4 4"/>'),
  zoomIn: wrap('<circle cx="11" cy="11" r="6"/><path d="M11 8v6M8 11h6M20 20l-4.5-4.5"/>'),
  zoomOut: wrap('<circle cx="11" cy="11" r="6"/><path d="M8 11h6M20 20l-4.5-4.5"/>'),
  fit: wrap('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>'),
  layout: wrap('<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M12 8v4M12 12H6v3M12 12h6v3"/>'),
  trash: wrap('<path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"/>'),
  copy: wrap('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>'),
  download: wrap('<path d="M12 4v10M8 11l4 4 4-4M5 19h14"/>'),
  upload: wrap('<path d="M12 20V9M8 12l4-4 4 4M5 5h14"/>'),
  docs: wrap('<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'),
  moon: wrap('<path d="M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5Z"/>'),
  grid: wrap('<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>'),
  code: wrap('<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>'),
  sparkle: wrap('<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 16l.9 2.2L21 19l-2.1.8L18 22l-.9-2.2L15 19l2.1-.8z"/>'),
  info: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2v.1"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: wrap('<path d="m5 13 4 4L19 7"/>'),
  alignLeft: wrap('<path d="M4 4v16"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="7" y="14" width="6" height="4" rx="1"/>'),
  alignCenterH: wrap('<path d="M12 4v16"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>'),
  alignRight: wrap('<path d="M20 4v16"/><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="11" y="14" width="6" height="4" rx="1"/>'),
  alignTop: wrap('<path d="M4 4h16"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="7" width="4" height="6" rx="1"/>'),
  alignCenterV: wrap('<path d="M4 12h16"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>'),
  alignBottom: wrap('<path d="M4 20h16"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="14" y="11" width="4" height="6" rx="1"/>'),
  spaceH: wrap('<path d="M4 4v16M20 4v16"/><rect x="9" y="8" width="6" height="8" rx="1"/>'),
  spaceV: wrap('<path d="M4 4h16M4 20h16"/><rect x="8" y="9" width="8" height="6" rx="1"/>'),
  arrowRight: wrap('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  bold: wrap('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: wrap('<path d="M14 5h-4M14 19h-4M15 5l-4 14"/>'),
  underline: wrap('<path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"/>'),
  uppercase: wrap('<path d="M3 18 7.5 7 12 18M4.6 14.5h5.8M14 18l3.5-8 3.5 8M15.2 15.6h4.6"/>'),
  alignTextLeft: wrap('<path d="M4 6h16M4 11h10M4 16h14M4 21h8"/>'),
  alignTextCenter: wrap('<path d="M4 6h16M7 11h10M5 16h14M8 21h8"/>'),
  alignTextRight: wrap('<path d="M4 6h16M10 11h10M6 16h14M12 21h8"/>'),
  keyboard: wrap('<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M8 15h8"/>'),
};

export type IconName = keyof typeof icons;
