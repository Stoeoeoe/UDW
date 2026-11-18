import { useContext, useEffect, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';
import { useCurrentFrame, useDelayRender } from 'remotion';
import { motion, progress } from '../theme/motion';
import { tokens } from '../theme/tokens';
import {
  directions,
  PresentationDirection,
  type DirectionId,
} from '../theme/directions';

export type CodeLanguage =
  | 'csharp'
  | 'json'
  | 'typescript'
  | 'lua'
  | 'shellscript';
const cache = new Map<string, Promise<ThemedToken[][]>>();
const highlight = (
  code: string,
  language: CodeLanguage,
  direction: DirectionId,
) => {
  const key = `${direction}:${language}:${code}`;
  const { color, scheme } = directions[direction];
  if (!cache.has(key)) {
    cache.set(
      key,
      codeToTokens(code, {
        lang: language,
        theme: {
          name: `mercurius-${direction}`,
          type: scheme,
          colors: {
            'editor.background': color.surface,
            'editor.foreground': color.ink,
          },
          tokenColors: [
            {
              scope: ['keyword', 'storage'],
              settings: { foreground: color.accent },
            },
            {
              scope: ['entity.name', 'support.type', 'support.function'],
              settings: { foreground: color.secondary },
            },
            {
              scope: ['constant.numeric', 'constant.language'],
              settings: { foreground: color.highlight },
            },
            { scope: ['string'], settings: { foreground: color.secondary } },
            {
              scope: ['comment', 'punctuation'],
              settings: { foreground: color.muted },
            },
          ],
        },
      }).then((result) => result.tokens),
    );
  }
  return cache.get(key)!;
};

export const CodePanel = ({
  code,
  language,
  filename,
  emphasis = [],
  revealAt = 0,
  lineStagger = motion.staggerFrames,
}: {
  code: string;
  language: CodeLanguage;
  filename: string;
  emphasis?: readonly number[];
  revealAt?: number;
  lineStagger?: number;
}) => {
  const frame = useCurrentFrame();
  const direction = useContext(PresentationDirection);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Highlighting ${filename}`));
  const [lines, setLines] = useState<ThemedToken[][]>([]);
  useEffect(() => {
    highlight(code, language, direction)
      .then((result) => {
        setLines(result);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [code, language, direction, handle, continueRender, cancelRender]);
  return (
    <div className="panel h-full">
      <div
        className="flex items-center justify-between border-b border-border px-8 py-6 font-mono text-muted"
        style={{ fontSize: tokens.type.label }}
      >
        <span>{filename}</span>
        <span>{language === 'csharp' ? 'C#' : language}</span>
      </div>
      <pre
        style={{
          padding: '28px 0',
          fontFamily: tokens.font.mono,
          fontSize: tokens.type.code,
          lineHeight: 1.85,
          tabSize: 2,
        }}
      >
        <code>
          {lines.map((line, index) => {
            const active = emphasis.includes(index + 1);
            const reveal = progress(
              frame,
              revealAt + index * lineStagger,
              motion.entranceFrames,
            );
            return (
              <div
                key={index}
                style={{
                  opacity:
                    reveal * (emphasis.length === 0 || active ? 1 : 0.55),
                  padding: '0 26px',
                  borderLeft: `4px solid ${active ? 'var(--mercurius-accent)' : 'transparent'}`,
                  background: active
                    ? 'var(--mercurius-raised)'
                    : 'transparent',
                }}
              >
                <span
                  className="mr-6 inline-block w-8 text-right text-muted"
                  style={{ userSelect: 'none' }}
                >
                  {index + 1}
                </span>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
                {line.length === 0 ? '\u00a0' : null}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
};
