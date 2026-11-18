import { MantineProvider } from '@mantine/core';
import { loadFont } from '@remotion/fonts';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, cancelRender, staticFile } from 'remotion';
import { makeTheme } from './mantine-theme';
import { fontFaces, tokens } from './tokens';
import {
  directions,
  PresentationDirection,
  type DirectionId,
} from './directions';
import { videoFormat } from './format';

for (const { asset, family } of fontFaces) {
  loadFont({
    family,
    url: staticFile(asset),
    weight: '400',
  }).catch(cancelRender);
}

const variables = Object.fromEntries([
  ...Object.entries(videoFormat.safe).map(([key, value]) => [
    `--mercurius-safe-${key}`,
    `${value}px`,
  ]),
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

export const Presentation = ({
  children,
  direction = 'terracotta',
}: {
  children: ReactNode;
  direction?: DirectionId;
}) => (
  <PresentationDirection.Provider value={direction}>
    <MantineProvider
      theme={makeTheme(directions[direction].color.accent)}
      forceColorScheme={directions[direction].scheme}
      getRootElement={() => undefined}
      cssVariablesSelector={`.mercurius-${direction}`}
    >
      <AbsoluteFill
        className={`mercurius-${direction} bg-canvas text-ink font-sans`}
        data-mantine-color-scheme={directions[direction].scheme}
        style={
          {
            ...variables,
            ...Object.fromEntries(
              Object.entries(directions[direction].color).map(
                ([key, value]) => [`--mercurius-${key}`, value],
              ),
            ),
            '--mercurius-radius': `${directions[direction].radius}px`,
            '--mercurius-tracking': directions[direction].tracking,
            fontSize: tokens.type.body,
          } as CSSProperties
        }
      >
        {children}
      </AbsoluteFill>
    </MantineProvider>
  </PresentationDirection.Provider>
);
