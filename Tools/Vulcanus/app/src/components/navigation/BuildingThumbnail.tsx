import React from 'react';
import { Box, Image } from '@chakra-ui/react';
import type { Building } from '../../types/building';
import type { ResolvedKit } from '../../lib/buildings/resolveKit';
import { exteriorCanvas } from '../../lib/buildings/render';
import { useEditorStore } from '../../store/useEditorStore';
import { useResolvedKitsStore } from '../../store/useResolvedKitsStore';

const urls = new WeakMap<HTMLCanvasElement, string>();

function exteriorImage(building: Building, kit: ResolvedKit): string {
  const canvas = exteriorCanvas(building, kit, []);
  let url = urls.get(canvas);
  if (!url) urls.set(canvas, (url = canvas.toDataURL()));
  return url;
}

/** The building's exterior in its base look, as an icon of `size`; `fallback` until its kit can be read. */
export const BuildingThumbnail: React.FC<{
  buildingId: string;
  fallback: React.ReactElement;
  size?: string;
}> = ({ buildingId, fallback, size = '18px' }) => {
  const building = useEditorStore((state) =>
    state.buildings.find((entry) => entry.id === buildingId),
  );
  const resolved = useResolvedKitsStore((state) =>
    building ? state.kits[building.kit] : undefined,
  );
  if (!building || resolved?.status !== 'ready') return fallback;
  return (
    <Box boxSize={size} flexShrink={0}>
      <Image
        src={exteriorImage(building, resolved.kit)}
        alt=""
        boxSize="full"
        objectFit="contain"
        style={{ imageRendering: 'pixelated' }}
      />
    </Box>
  );
};
