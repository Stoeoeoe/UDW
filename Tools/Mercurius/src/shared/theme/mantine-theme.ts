import { createTheme } from '@mantine/core';
import { tokens } from './tokens';

export const makeTheme = (accent: string) =>
  createTheme({
    fontFamily: tokens.font.sans,
    fontFamilyMonospace: tokens.font.mono,
    primaryColor: 'accent',
    colors: {
      accent: Array.from({ length: 10 }, () => accent) as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ],
    },
    spacing: Object.fromEntries(
      Object.entries(tokens.space).map(([key, value]) => [key, `${value}px`]),
    ),
    defaultRadius: tokens.radius,
    components: {
      Badge: { defaultProps: { variant: 'outline', size: 'xl' } },
      Paper: { defaultProps: { radius: tokens.radius } },
    },
  });
