import { useId } from 'react';

export const ornaments = [
  { id: 'meander', name: 'Meander' },
  { id: 'laurel', name: 'Laurel' },
  { id: 'wave', name: 'Wave' },
  { id: 'none', name: 'None' },
] as const;
export type OrnamentId = (typeof ornaments)[number]['id'];

// Original vector ornaments inspired by the supplied Roman border references.
// Kept outside the content rectangle, so the border never competes with labels.
export const OrnamentTile = ({ ornament }: { ornament: OrnamentId }) => {
  switch (ornament) {
    case 'meander':
      return (
        <path
          d="M0 56H84V8H12V44H60V20H36V32H48"
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinejoin="miter"
        />
      );
    case 'wave':
      return (
        <path
          d="M0 48C18 48 10 12 40 12C66 12 72 40 52 40C40 40 36 26 48 24C64 22 74 48 96 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
        />
      );
    case 'laurel':
      return (
        <g fill="currentColor">
          <path
            d="M0 34Q48 26 96 34"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          />
          <path d="M12 32Q4 9 30 9Q33 27 12 32ZM39 31Q35 7 59 9Q61 28 39 31ZM66 32Q65 9 88 13Q87 29 66 32ZM22 32Q24 56 47 56Q47 37 22 32ZM52 31Q55 55 77 53Q76 35 52 31Z" />
        </g>
      );
    case 'none':
      return null;
  }
};

export const RomanOrnament = ({ ornament }: { ornament: OrnamentId }) => {
  const id = `roman-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (ornament === 'none') return null;
  return (
    <svg
      viewBox="0 0 1080 1920"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      style={{ color: 'var(--mercurius-ink)' }}
    >
      <defs>
        <pattern id={id} width={96} height={64} patternUnits="userSpaceOnUse">
          <OrnamentTile ornament={ornament} />
        </pattern>
      </defs>
      <path
        d="M28 40V1880H1052V40"
        fill="none"
        stroke="var(--mercurius-accent)"
        strokeWidth={3}
        opacity={0.65}
      />
      <g transform="translate(0 48)">
        <rect width={1080} height={64} fill={`url(#${id})`} />
        <path
          d="M0 -8H1080M0 73H1080"
          fill="none"
          stroke="var(--mercurius-accent)"
          strokeWidth={4}
        />
      </g>
      <g transform="translate(0 1824)">
        <rect width={1080} height={64} fill={`url(#${id})`} />
        <path
          d="M0 -8H1080M0 73H1080"
          fill="none"
          stroke="var(--mercurius-accent)"
          strokeWidth={4}
        />
      </g>
    </svg>
  );
};
