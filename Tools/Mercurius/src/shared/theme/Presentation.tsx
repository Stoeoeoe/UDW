import { MantineProvider } from '@mantine/core';
import { loadFont } from '@remotion/fonts';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, cancelRender, staticFile } from 'remotion';
import { theme } from './mantine-theme';
import { fontAssets, tokens } from './tokens';

for (const [index, url] of fontAssets.entries()) {
  loadFont({
    family: index === 2 ? tokens.font.mono : tokens.font.sans,
    url: staticFile(url),
    weight: index === 1 ? '700' : '400',
  }).catch(cancelRender);
}

const variables = Object.fromEntries([
  ...Object.entries(tokens.color).map(([key, value]) => [
    `--mercurius-${key}`,
    value,
  ]),
  ...Object.entries(tokens.font).map(([key, value]) => [
    `--mercurius-${key}`,
    value,
  ]),
  ...Object.entries(tokens.space).map(([key, value]) => [
    `--mercurius-space-${key}`,
    `${value}px`,
  ]),
]);

export const Presentation = ({ children }: { children: ReactNode }) => (
  <MantineProvider theme={theme} forceColorScheme="dark">
    <AbsoluteFill
      className="bg-canvas text-ink font-sans"
      style={{ ...variables, fontSize: tokens.type.body } as CSSProperties}
    >
      {children}
    </AbsoluteFill>
  </MantineProvider>
);
