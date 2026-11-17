export const tokens = {
  color: {
    canvas: '#10191c',
    surface: '#1a272b',
    raised: '#23353a',
    ink: '#f0eee4',
    muted: '#a5b6b9',
    accent: '#b9e38c',
    signal: '#efb779',
    border: '#3b5055',
  },
  font: { sans: 'Inter', mono: 'JetBrains Mono' },
  space: { xs: 8, sm: 16, md: 24, lg: 40, xl: 64, safe: 96 },
  type: { label: 22, body: 30, code: 26, heading: 60, title: 112 },
  radius: 24,
} as const;

export const fontAssets = [
  'shared/fonts/inter-latin-400-normal.woff2',
  'shared/fonts/inter-latin-700-normal.woff2',
  'shared/fonts/jetbrains-mono-latin-400-normal.woff2',
];
