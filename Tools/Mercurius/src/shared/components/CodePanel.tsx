import { useEffect, useState } from 'react';
import { codeToTokens, type ThemedToken } from 'shiki';
import { useCurrentFrame, useDelayRender } from 'remotion';
import { motion, progress } from '../theme/motion';
import { tokens } from '../theme/tokens';

export type CodeLanguage =
  | 'csharp'
  | 'json'
  | 'typescript'
  | 'lua'
  | 'shellscript';
const cache = new Map<string, Promise<ThemedToken[][]>>();
const highlight = (code: string, language: CodeLanguage) => {
  const key = `${language}:${code}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      codeToTokens(code, { lang: language, theme: 'github-dark' }).then(
        (result) => result.tokens,
      ),
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
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Highlighting ${filename}`));
  const [lines, setLines] = useState<ThemedToken[][]>([]);
  useEffect(() => {
    highlight(code, language)
      .then((result) => {
        setLines(result);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [code, language, handle, continueRender, cancelRender]);
  return (
    <div className="panel h-full">
      <div
        className="flex items-center justify-between border-b border-border px-8 py-6 font-mono text-muted"
        style={{ fontSize: 20 }}
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
                    reveal * (emphasis.length === 0 || active ? 1 : 0.35),
                  padding: '0 26px',
                  borderLeft: `4px solid ${active ? tokens.color.accent : 'transparent'}`,
                  background: active ? tokens.color.raised : 'transparent',
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
