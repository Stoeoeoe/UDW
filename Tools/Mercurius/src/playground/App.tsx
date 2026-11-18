import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, Thumbnail, type PlayerRef } from '@remotion/player';
import { Check, Copy, Columns2, RotateCcw, Scan } from 'lucide-react';
import { directions, type DirectionId } from '../shared/theme/directions';
import { videoFormat } from '../shared/theme/format';
import {
  ornaments,
  OrnamentTile,
  type OrnamentId,
} from '../shared/components/RomanOrnament';
import { StudyScene } from './StudyScene';
import {
  checkpoints,
  findStudy,
  studies,
  studyTiming,
  type StudyId,
} from './studies';

const directionIds = Object.keys(directions) as DirectionId[];
const readSelection = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    study: findStudy(params.get('study') ?? '')?.id ?? 'dependency',
    direction:
      directionIds.find((id) => id === params.get('direction')) ?? 'parchment',
    ornament:
      ornaments.find(({ id }) => id === params.get('ornament'))?.id ??
      'meander',
  };
};
export const App = () => {
  const [selection, setSelection] = useState(readSelection);
  const [compare, setCompare] = useState(false);
  const [guides, setGuides] = useState(false);
  const [copied, setCopied] = useState(false);
  const [frame, setFrame] = useState<number>(168);
  const player = useRef<PlayerRef>(null);
  const { study, direction, ornament } = selection;
  const entry = findStudy(study)!;
  const inputProps = useMemo(
    () => ({ study, direction, ornament }),
    [study, direction, ornament],
  );
  useEffect(() => {
    const onHash = () => {
      setSelection(readSelection());
      setFrame(168);
      setCopied(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      `#${new URLSearchParams({ study, direction, ornament })}`,
    );
    const current = player.current!;
    const update = ({ detail }: { detail: { frame: number } }) => {
      setFrame(detail.frame);
      setCopied(false);
    };
    current.addEventListener('frameupdate', update);
    return () => current.removeEventListener('frameupdate', update);
  }, [study, direction, ornament]);
  const select = (nextStudy: StudyId, nextDirection = direction) => {
    if (nextStudy === study && nextDirection === direction)
      player.current!.seekTo(168);
    setSelection({ study: nextStudy, direction: nextDirection, ornament });
    setFrame(168);
    setCopied(false);
  };
  const seek = (nextFrame: number) => {
    player.current!.pause();
    player.current!.seekTo(nextFrame);
    setFrame(nextFrame);
  };
  const reference = `${entry.number} ${entry.name} / ${directions[direction].name} / ${ornament} / f${frame}`;
  const selectOrnament = (next: OrnamentId) => {
    setSelection({ ...selection, ornament: next });
    setCopied(false);
  };
  return (
    <div className="pg-shell">
      <aside className="pg-sidebar">
        <a
          className="pg-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            select('dependency');
          }}
        >
          MERCURIUS<span>STUDIES</span>
        </a>
        <nav aria-label="Design studies">
          {['Diagrams', 'Foundations'].map((group) => (
            <div className="pg-nav-group" key={group}>
              <h2>{group}</h2>
              {studies
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    className={item.id === study ? 'is-selected' : ''}
                    aria-current={item.id === study ? 'page' : undefined}
                    onClick={() => select(item.id)}
                  >
                    <span>{item.number}</span>
                    {item.name}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="pg-sidebar-bottom">
          1080 × 1920<span>9:16 / 30 FPS</span>
        </div>
      </aside>
      <main className="pg-main">
        <header className="pg-topbar">
          <div>
            <span>{entry.number}</span>
            <h1>{entry.name}</h1>
          </div>
          <div>
            <button
              aria-pressed={guides}
              title="Caption and interface guides"
              onClick={() => setGuides(!guides)}
            >
              <Scan size={16} />
              Safe areas
            </button>
            <button aria-pressed={compare} onClick={() => setCompare(!compare)}>
              <Columns2 size={16} />
              Compare
            </button>
          </div>
        </header>
        <div className="pg-workbench">
          <section className="pg-preview" aria-label="Animated study preview">
            <div className="pg-video-stage">
              <Player
                key={`${study}-${direction}`}
                ref={player}
                component={StudyScene}
                inputProps={inputProps}
                durationInFrames={studyTiming.duration}
                compositionWidth={videoFormat.width}
                compositionHeight={videoFormat.height}
                fps={30}
                initialFrame={168}
                controls
                loop
                style={{ width: '100%', aspectRatio: '9 / 16' }}
              />
              {guides ? (
                <svg
                  className="pg-guides"
                  viewBox="0 0 1080 1920"
                  aria-label="House safe area guides"
                >
                  <path
                    d="M0 0H1080V1920H0ZM72 160V1580H912V160Z"
                    fill="#e69373"
                    fillOpacity="0.12"
                    fillRule="evenodd"
                  />
                  <rect
                    x={72}
                    y={160}
                    width={840}
                    height={1420}
                    fill="none"
                    stroke="#e69373"
                    strokeDasharray="14 10"
                    strokeWidth={3}
                  />
                  {[980, 1140, 1300].map((y) => (
                    <circle
                      key={y}
                      cx={1005}
                      cy={y}
                      r={35}
                      fill="white"
                      fillOpacity="0.2"
                    />
                  ))}
                  <rect
                    x={120}
                    y={1645}
                    width={760}
                    height={130}
                    fill="#171C24"
                    fillOpacity="0.9"
                  />
                  <text
                    x={500}
                    y={1725}
                    textAnchor="middle"
                    fill="#F3EBDD"
                    fontSize={42}
                  >
                    Caption area
                  </text>
                </svg>
              ) : null}
            </div>
            <div className="pg-transport">
              <button
                aria-label="Play from beginning"
                onClick={() => {
                  player.current!.seekTo(0);
                  player.current!.play();
                }}
              >
                <RotateCcw size={15} />
              </button>
              {checkpoints.map((checkpoint) => (
                <button
                  key={checkpoint.name}
                  aria-pressed={frame === checkpoint.frame}
                  onClick={() => seek(checkpoint.frame)}
                >
                  {checkpoint.name}
                </button>
              ))}
              <output aria-label="Current frame">
                {String(frame).padStart(3, '0')}f
              </output>
            </div>
          </section>
          <aside className="pg-options">
            <h2>Palette</h2>
            {directionIds.map((id) => (
              <button
                className={
                  id === direction ? 'pg-palette is-selected' : 'pg-palette'
                }
                key={id}
                aria-pressed={id === direction}
                onClick={() => select(study, id)}
              >
                <div style={{ background: directions[id].color.canvas }}>
                  <i style={{ background: directions[id].color.accent }} />
                  <i style={{ background: directions[id].color.secondary }} />
                  <i style={{ background: directions[id].color.ink }} />
                </div>
                <span>
                  {directions[id].name}
                  {id === direction ? <Check size={14} /> : null}
                </span>
              </button>
            ))}
            <div className="pg-pattern-options">
              <h2>Border</h2>
              <div className="pg-pattern-grid">
                {ornaments.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={ornament === item.id}
                    onClick={() => selectOrnament(item.id)}
                  >
                    <svg viewBox="0 0 96 64" aria-hidden="true">
                      <OrnamentTile ornament={item.id} />
                    </svg>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pg-reference">
              <code>{reference}</code>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${reference}\n${window.location.href}`,
                  );
                  setCopied(true);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy reference'}
              </button>
            </div>
            {guides ? (
              <p className="pg-guide-note">
                House margins for captions and interface overlays. Approximate,
                not platform presets.
              </p>
            ) : null}
          </aside>
        </div>
        {compare ? (
          <section className="pg-comparison" aria-label="Palette comparison">
            {directionIds.map((id) => (
              <button
                key={id}
                aria-label={`Select ${directions[id].name} comparison`}
                onClick={() => select(study, id)}
              >
                <Thumbnail
                  component={StudyScene}
                  inputProps={{ study, direction: id, ornament }}
                  frameToDisplay={168}
                  durationInFrames={studyTiming.duration}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  fps={30}
                  style={{ width: '100%', aspectRatio: '9 / 16' }}
                />
                <span>{directions[id].name}</span>
              </button>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
};
