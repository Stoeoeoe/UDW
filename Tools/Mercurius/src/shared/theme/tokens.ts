export const tokens = {
  color: {
    canvas: '#171C24',
    surface: '#232B36',
    raised: '#3B2D2A',
    ink: '#F3EBDD',
    muted: '#A6ADB8',
    accent: '#E69373',
    secondary: '#76B8AE',
    signal: '#E69373',
    highlight: '#D9BC77',
    border: '#64574D',
  },
  font: { sans: 'Gideon Roman', display: 'Cinzel', mono: 'Noto Sans Mono' },
  space: { xs: 8, sm: 16, md: 24, lg: 40, xl: 64, safe: 72 },
  type: { label: 32, body: 44, code: 36, heading: 72, title: 88 },
  radius: 24,
} as const;

export const fontFaces = [
  {
    asset: 'shared/fonts/cinzel-latin-400-normal.woff2',
    family: tokens.font.display,
  },
  {
    asset: 'shared/fonts/gideon-roman-latin-400-normal.woff2',
    family: tokens.font.sans,
  },
  {
    asset: 'shared/fonts/noto-sans-mono-latin-400-normal.woff2',
    family: tokens.font.mono,
  },
];
export const fontAssets = fontFaces.map(({ asset }) => asset);
