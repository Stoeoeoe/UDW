import type { ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { Connection } from '../shared/diagrams/Connection';
import { Node, anchor, type Point } from '../shared/diagrams/Node';
import { progress } from '../shared/theme/motion';
import { studyTiming, type StudyId } from './studies';

const c = {
  ink: 'var(--mercurius-ink)',
  muted: 'var(--mercurius-muted)',
  accent: 'var(--mercurius-accent)',
  secondary: 'var(--mercurius-secondary)',
  signal: 'var(--mercurius-signal)',
  border: 'var(--mercurius-border)',
  surface: 'var(--mercurius-surface)',
  raised: 'var(--mercurius-raised)',
};
const a = { x: 130, y: 95, width: 580, height: 150 };
const b = { x: 130, y: 365, width: 580, height: 150 };
const d = { x: 130, y: 635, width: 580, height: 150 };
const Label = ({
  x,
  y,
  children,
  accent = false,
}: Point & { children: ReactNode; accent?: boolean }) => (
  <text
    x={x}
    y={y}
    textAnchor="middle"
    fontSize={32}
    fill={accent ? c.accent : c.muted}
  >
    {children}
  </text>
);
const Dot = ({
  from,
  to,
  value,
}: {
  from: Point;
  to: Point;
  value: number;
}) => (
  <circle
    cx={from.x + (to.x - from.x) * value}
    cy={from.y + (to.y - from.y) * value}
    r={11}
    fill={c.accent}
    opacity={value > 0 && value < 1 ? 1 : 0}
  />
);

export const DiagramStudy = ({ study }: { study: StudyId }) => {
  const frame = useCurrentFrame();
  const focus = frame >= studyTiming.focus;
  const flow = progress(frame, studyTiming.follow, 66);
  let content: ReactNode;
  switch (study) {
    case 'dependency': {
      const caller = { ...a, y: 150 };
      const service = { ...d, y: 540 };
      content = (
        <>
          <Connection
            from={anchor(caller, 'bottom')}
            to={anchor(service, 'top')}
            label="requires"
            start={studyTiming.follow}
            duration={48}
          />
          <Node
            bounds={caller}
            title="Delivery"
            subtitle="caller"
            active={!focus}
          />
          <Node
            bounds={service}
            title="Inventory"
            subtitle="required dependency"
            active={focus}
            start={18}
          />
          <Dot
            from={anchor(caller, 'bottom')}
            to={anchor(service, 'top')}
            value={flow}
          />
        </>
      );
      break;
    }
    case 'sequence': {
      const positions = [140, 420, 700];
      content = (
        <>
          {positions.map((x, i) => (
            <g key={x}>
              <line
                x1={x}
                x2={x}
                y1={220}
                y2={800}
                stroke={c.border}
                strokeDasharray="8 8"
                strokeWidth={2}
              />
              <Node
                bounds={{ x: x - 125, y: 40, width: 250, height: 170 }}
                title={['Caller', 'Delivery', 'Inventory'][i]}
                active={focus && i === 2}
              />
            </g>
          ))}
          <Connection
            from={{ x: 140, y: 340 }}
            to={{ x: 420, y: 340 }}
            label="1. begin"
            start={24}
          />
          <Connection
            from={{ x: 420, y: 510 }}
            to={{ x: 700, y: 510 }}
            label="2. inspect"
            start={studyTiming.follow}
          />
          <g opacity={progress(frame, studyTiming.focus, 24)}>
            <line
              x1={700}
              x2={420}
              y1={700}
              y2={700}
              stroke={c.secondary}
              strokeWidth={3}
              strokeDasharray="10 8"
            />
            <path
              d="M435 691L420 700L435 709"
              fill="none"
              stroke={c.secondary}
              strokeWidth={3}
            />
            <Label x={560} y={675}>
              3. result
            </Label>
          </g>
          <Dot from={{ x: 420, y: 510 }} to={{ x: 700, y: 510 }} value={flow} />
        </>
      );
      break;
    }
    case 'state': {
      const complete = frame >= studyTiming.focus + 24;
      content = (
        <>
          <Connection
            from={anchor(a, 'bottom')}
            to={anchor(b, 'top')}
            label="accept"
            start={36}
          />
          <Connection
            from={anchor(b, 'bottom')}
            to={anchor(d, 'top')}
            label="deliver"
            start={studyTiming.focus}
          />
          <Node
            bounds={a}
            title="Available"
            subtitle="can be accepted"
            active={frame < studyTiming.follow}
          />
          <Node
            bounds={b}
            title="Accepted"
            subtitle="delivery pending"
            active={frame >= studyTiming.follow && !complete}
            start={12}
          />
          <Node
            bounds={d}
            title="Complete"
            subtitle="delivery recorded"
            active={complete}
            start={24}
          />
          <circle
            cx={90}
            cy={complete ? 710 : frame >= studyTiming.follow ? 440 : 170}
            r={11}
            fill={c.accent}
          />
        </>
      );
      break;
    }
    case 'pipeline':
      content = (
        <>
          <Label x={420} y={55}>
            AUTHORING
          </Label>
          <Label x={420} y={325}>
            INTERCHANGE
          </Label>
          <Label x={420} y={595}>
            RUNTIME
          </Label>
          <Connection
            from={anchor(a, 'bottom')}
            to={anchor(b, 'top')}
            label="export"
            start={30}
          />
          <Connection
            from={anchor(b, 'bottom')}
            to={anchor(d, 'top')}
            label="import"
            start={studyTiming.follow}
          />
          <Node
            bounds={a}
            title="Authored content"
            subtitle="editable source"
          />
          <Node
            bounds={b}
            title="JSON document"
            subtitle="portable representation"
            start={12}
          />
          <Node
            bounds={d}
            title="Game definition"
            subtitle="runtime representation"
            active={focus}
            start={24}
          />
          <Dot from={anchor(b, 'bottom')} to={anchor(d, 'top')} value={flow} />
        </>
      );
      break;
    case 'timeline': {
      const startX = 40;
      const unit = 126;
      const playhead = startX + progress(frame, 30, 180) * 6 * unit;
      content = (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <line
                x1={startX + i * unit}
                x2={startX + i * unit}
                y1={105}
                y2={710}
                stroke={c.border}
              />
              <Label x={startX + i * unit} y={70}>
                {i}s
              </Label>
            </g>
          ))}
          {[
            { label: 'Actor moves', y: 220, offset: 0, duration: 3 },
            { label: 'Camera follows', y: 420, offset: 0, duration: 4 },
            { label: 'Dialogue', y: 620, offset: 4, duration: 2 },
          ].map((track, index) => (
            <g key={track.label}>
              <text x={40} y={track.y - 28} fill={c.ink} fontSize={38}>
                {track.label}
              </text>
              <rect
                x={startX + track.offset * unit}
                y={track.y}
                width={track.duration * unit}
                height={76}
                rx={5}
                fill={index === 2 ? c.raised : c.surface}
                stroke={index === 2 && focus ? c.accent : c.border}
                strokeWidth={3}
                opacity={progress(frame, index * 12, 24)}
              />
            </g>
          ))}
          <line
            x1={startX + 4 * unit}
            x2={startX + 4 * unit}
            y1={105}
            y2={730}
            stroke={c.signal}
            strokeDasharray="5 6"
            strokeWidth={2}
          />
          <Label x={420} y={800}>
            Dialogue waits for the camera.
          </Label>
          <line
            x1={playhead}
            x2={playhead}
            y1={100}
            y2={715}
            stroke={c.accent}
            strokeWidth={4}
          />
          <circle cx={playhead} cy={100} r={9} fill={c.accent} />
        </>
      );
      break;
    }
    case 'comparison':
      content = (
        <>
          <Label x={420} y={65}>
            BEFORE / IMPLICIT
          </Label>
          <Node
            bounds={{ ...a, y: 120 }}
            title="Delivery"
            subtitle="looks up Inventory"
          />
          <Label x={420} y={340}>
            The requirement is hidden.
          </Label>
          <line x1={70} x2={770} y1={415} y2={415} stroke={c.border} />
          <Label x={420} y={485} accent>
            AFTER / EXPLICIT
          </Label>
          <Node
            bounds={{ ...a, y: 535 }}
            title="Delivery(Inventory)"
            subtitle="caller supplies dependency"
            active={focus}
            start={30}
          />
          <g opacity={progress(frame, studyTiming.focus, 24)}>
            <Label x={420} y={765} accent>
              Cost: the caller must wire it.
            </Label>
          </g>
        </>
      );
      break;
    case 'spatial': {
      const pathProgress = progress(frame, studyTiming.follow, 72);
      content = (
        <>
          <rect
            x={40}
            y={40}
            width={760}
            height={740}
            rx={10}
            fill={c.surface}
            stroke={c.border}
          />
          {Array.from({ length: 6 }, (_, i) => (
            <line
              key={i}
              x1={100 + i * 120}
              x2={100 + i * 120}
              y1={40}
              y2={780}
              stroke={c.border}
              opacity={0.4}
            />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <line
              key={i}
              x1={40}
              x2={800}
              y1={100 + i * 120}
              y2={100 + i * 120}
              stroke={c.border}
              opacity={0.4}
            />
          ))}
          {[
            { x: 120, y: 150, width: 230, height: 150 },
            { x: 510, y: 150, width: 210, height: 190 },
            { x: 100, y: 510, width: 240, height: 150 },
            { x: 500, y: 530, width: 220, height: 150 },
          ].map((rect, i) => (
            <rect key={i} {...rect} fill={c.raised} stroke={c.border} />
          ))}
          <path
            d="M220 410H420V470H650"
            pathLength={1}
            stroke={c.accent}
            strokeWidth={7}
            fill="none"
            strokeDasharray={1}
            strokeDashoffset={1 - pathProgress}
          />
          <circle cx={220} cy={410} r={13} fill={c.accent} />
          <g opacity={progress(frame, studyTiming.focus, 24)}>
            <circle
              cx={650}
              cy={470}
              r={45}
              fill="none"
              stroke={c.signal}
              strokeWidth={3}
            />
            <path
              d="M650 425V385H510"
              fill="none"
              stroke={c.signal}
              strokeWidth={2}
            />
            <text x={480} y={385} textAnchor="end" fill={c.ink} fontSize={34}>
              Destination
            </text>
          </g>
          <Label x={420} y={105}>
            SCHEMATIC / NOT GAME FOOTAGE
          </Label>
        </>
      );
      break;
    }
    default:
      throw new Error(`'${study}' is not a diagram study`);
  }
  return (
    <svg
      viewBox="0 0 840 840"
      className="h-full w-full"
      aria-label={`${study} diagram study`}
    >
      {content}
    </svg>
  );
};
