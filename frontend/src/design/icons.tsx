/**
 * Code-drawn icons. No icon font, no raster assets, no image-generation
 * dependency. Every icon inherits `currentColor` and scales with `size`.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'missions'
  | 'gift'
  | 'trophy'
  | 'more'
  | 'star'
  | 'coin'
  | 'bell'
  | 'user'
  | 'camera'
  | 'check'
  | 'close'
  | 'chevron'
  | 'plus'
  | 'settings'
  | 'clock'
  | 'alert'
  | 'flame'
  | 'lock'
  | 'kitchen'
  | 'trash'
  | 'laundry'
  | 'bedroom'
  | 'bathroom'
  | 'floors'
  | 'yard'
  | 'screen'
  | 'food'
  | 'activity'
  | 'chest'
  | 'target'
  | 'tree'
  | 'medal'
  | 'calendar'
  | 'inbox'
  | 'grid'
  | 'wallet'
  | 'arrow'
  | 'sparkle';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  title?: string;
}

const paths: Record<IconName, string> = {
  home: 'M3 11 12 3l9 8M5 10v10h14V10',
  missions: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C10 3 6 4 7 7M12 7c2-4 6-3 5 0',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  coin: 'M12 4a8 4 0 1 0 0 8 8 4 0 0 0 0-8ZM4 8v8a8 4 0 0 0 16 0V8',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  check: 'm4 13 5 5 11-12',
  close: 'M6 6 18 18M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 2l1.6 2.6 3-.4.6 3 2.6 1.6-1.6 2.6L20 14l-2.6 1.6-.6 3-3-.4L12 22l-1.6-2.6-3 .4-.6-3L4 14l1.6-2.6L4 8.8l2.6-1.6.6-3 3 .4z',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4l3 2',
  alert: 'M12 4 2 20h20zM12 10v5M12 18h.01',
  flame: 'M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2 2-5 2-8Z',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  kitchen: 'M5 3v18M5 3a3 3 0 0 1 0 8M14 3v7a3 3 0 0 0 3 3h1M18 3v18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  laundry: 'M4 3h16v18H4zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM7 6h.01M10 6h.01',
  bedroom: 'M3 18v-8h12a4 4 0 0 1 4 4v4M3 14h18M6 10V7h6v3',
  bathroom: 'M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM7 12V5a2 2 0 0 1 4 0',
  floors: 'M3 8h18M3 14h18M8 3v18M16 3v18',
  yard: 'M12 21V9M12 9c-4 0-6-3-6-6 4 0 6 3 6 6ZM12 9c4 0 6-3 6-6-4 0-6 3-6 6ZM4 21h16',
  screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
  food: 'M6 3v8a3 3 0 0 0 6 0V3M9 11v10M17 3c-2 2-2 6 0 8v10',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  chest: 'M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10H3zM3 12h18M10 10h4v5h-4z',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z',
  tree: 'M12 3 6 11h3l-4 6h14l-4-6h3zM12 17v4',
  medal: 'M8 3l2 6M16 3l-2 6M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM12 13l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 15.3l2-.3z',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  inbox: 'M3 13h5l2 3h4l2-3h5M3 13l3-8h12l3 8v8H3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  wallet: 'M3 7h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2zM3 7a2 2 0 0 1 2-2h11M17 13h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  sparkle: 'M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3',
};

export function Icon({ name, size = 22, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
