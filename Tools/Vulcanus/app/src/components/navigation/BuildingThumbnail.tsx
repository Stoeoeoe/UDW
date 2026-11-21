import React from 'react';
import { Box, Image } from '@chakra-ui/react';
import type { Building } from '../../types/building';
import type { ResolvedKit } from '../../lib/buildings/resolveKit';
import { layoutExterior, STOREY_ROWS } from '../../lib/buildings/layout';
import { drawList, renderDraws } from '../../lib/buildings/render';
import { KIT_TILE } from '../../lib/buildings/kitLayout';
import { useEditorStore } from '../../store/useEditorStore';
import { useResolvedKitsStore } from '../../store/useResolvedKitsStore';

/** One image per building revision and kit: an edit or a re-read kit replaces the object, and so the entry. */
const cache = new WeakMap<Building, { kit: ResolvedKit; url: string }>();

function exteriorImage(building: Building, kit: ResolvedKit): string {
  const cached = cache.get(building);
  if (cached?.kit === kit) return cached.url;
  const canvas = document.createElement('canvas');
  canvas.width = building.width * KIT_TILE;
  canvas.height = (building.depth + STOREY_ROWS) * KIT_TILE;
  renderDraws(drawList(layoutExterior(building), kit, []), kit, canvas.getContext('2d')!);
  const url = canvas.toDataURL();
  cache.set(building, { kit, url });
  return url;
}

/** The building's exterior in its base look, as an explorer icon; `fallback` until its kit can be read. */
export const BuildingThumbnail: React.FC<{ buildingId: string; fallback: React.ReactElement }> = ({
  buildingId,
  fallback,
}) => {
  const building = useEditorStore((state) =>
    state.buildings.find((entry) => entry.id === buildingId),
  );
  const resolved = useResolvedKitsStore((state) =>
    building ? state.kits[building.kit] : undefined,
  );
  if (!building || resolved?.status !== 'ready') return fallback;
  return (
    <Box boxSize="18px" flexShrink={0}>
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
