// Iconos de línea (24×24, trazo 1.6). Reemplazan a los emojis de la interfaz.
// Decorativos por defecto (aria-hidden): el texto que los acompaña ya dice qué son.

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v3M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h2',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  megaphone: 'M3 11v3a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1zM18 9a4 4 0 0 1 0 6',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10',
  team: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.5l2.5 2.5 4.5-5',
  message: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z',
  file: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  tick: 'm5 12.5 4.5 4.5L19 7',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.3 14a4.2 4.2 0 0 0 7.4 0M9 9.8h.01M15 9.8h.01',
  sticker: 'M6 4h12a2 2 0 0 1 2 2v7l-7 7H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM20 13h-5a2 2 0 0 0-2 2v5',
  keyboard: 'M3 6.5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M7.5 14h9',
  send: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  back: 'm15 5-7 7 7 7',
  down: 'M12 5v14M6 13l6 6 6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  chevron: 'm6 9 6 6 6-6',
  logout: 'M15 17l5-5-5-5M20 12H9M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  menu: 'M3 12h18M3 6h18M3 18h18',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18, className = '', title }: {
  name: IconName; size?: number; className?: string; title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={name === 'more' ? 2.4 : 1.6} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      aria-label={title}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
