// Market codes -> names and small inline SVG flags (emoji flags render as letters on Windows).
export interface Market {
  name: string;
  /** SVG content for a 30x20 viewBox. */
  flag: string;
  /** Drawn without the flag frame (the globe). */
  plain?: boolean;
}

export const MARKETS: Record<string, Market> = {
  RDW: {
    name: "Rest of world",
    flag: '<circle cx="15" cy="10" r="8.4" fill="#2f6fae"/><path d="M15 1.6v16.8M6.6 10h16.8M8.2 5.4h13.6M8.2 14.6h13.6" stroke="#cfe3f5" stroke-width="1" fill="none"/><ellipse cx="15" cy="10" rx="3.8" ry="8.4" stroke="#cfe3f5" stroke-width="1" fill="none"/>',
    plain: true,
  },
  USA: {
    name: "United States",
    flag: '<rect width="30" height="20" fill="#b22234"/><path d="M0 2.3h30M0 5.4h30M0 8.5h30M0 11.5h30M0 14.6h30M0 17.7h30" stroke="#fff" stroke-width="1.54"/><rect width="13" height="10.8" fill="#3c3b6e"/><g fill="#fff"><circle cx="2.5" cy="2.2" r=".7"/><circle cx="6.5" cy="2.2" r=".7"/><circle cx="10.5" cy="2.2" r=".7"/><circle cx="4.5" cy="5.4" r=".7"/><circle cx="8.5" cy="5.4" r=".7"/><circle cx="2.5" cy="8.6" r=".7"/><circle cx="6.5" cy="8.6" r=".7"/><circle cx="10.5" cy="8.6" r=".7"/></g>',
  },
  CA: {
    name: "China",
    flag: '<rect width="30" height="20" fill="#de2910"/><path fill="#ffde00" d="M5 2.2l1.1 3.4h3.6l-2.9 2.1 1.1 3.4L5 9l-2.9 2.1 1.1-3.4L.3 5.6h3.6z"/><g fill="#ffde00"><circle cx="11" cy="2.4" r=".9"/><circle cx="12.8" cy="4.6" r=".9"/><circle cx="12.8" cy="7.6" r=".9"/><circle cx="11" cy="9.6" r=".9"/></g>',
  },
  MEX: {
    name: "Mexico",
    flag: '<rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce1126"/><circle cx="15" cy="10" r="2.4" fill="#8c5b2c"/>',
  },
  ZA: {
    name: "South Africa",
    flag: '<rect width="30" height="20" fill="#001489"/><rect width="30" height="10" fill="#e03c31"/><path d="M0 0l15 10L0 20M15 10h15" stroke="#fff" stroke-width="6.6" fill="none"/><path d="M0 0l15 10L0 20M15 10h15" stroke="#007749" stroke-width="4" fill="none"/><path d="M0 3.3L10 10 0 16.7z" fill="#ffb81c"/><path d="M0 4.7L7.9 10 0 15.3z" fill="#000"/>',
  },
  RA: {
    name: "Argentina",
    flag: '<rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#f6b40e"/>',
  },
  BR: {
    name: "Brazil",
    flag: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2L27.6 10 15 17.8 2.4 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.2c3-1 6.1-.8 8.8.6" stroke="#fff" stroke-width=".9" fill="none"/>',
  },
};
export const marketName = (m: string) => MARKETS[m]?.name ?? m;
