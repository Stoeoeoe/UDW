import { createContext } from 'react';
import { tokens } from './tokens';

export const directions = {
  terracotta: {
    name: 'Terracotta',
    color: tokens.color,
    scheme: 'dark',
    radius: 4,
    tracking: '-0.025em',
  },
  parchment: {
    name: 'Paper & ink',
    color: {
      canvas: '#F3EBDD',
      surface: '#E7DDCC',
      raised: '#DFCFB7',
      ink: '#171C24',
      muted: '#6D6259',
      accent: '#B94F2C',
      secondary: '#286C65',
      signal: '#A4502B',
      highlight: '#927026',
      border: '#B9AA93',
    },
    scheme: 'light',
    radius: 4,
    tracking: '-0.025em',
  },
} as const;
export type DirectionId = keyof typeof directions;
export const PresentationDirection = createContext<DirectionId>('terracotta');
