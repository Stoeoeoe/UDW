import { useEffect, useRef, useState } from 'react';
import { Button, ButtonGroup, HStack, Text, VStack } from '@chakra-ui/react';
import type { Building } from '../../../types/building';
import type { ResolvedKit } from '../../../lib/buildings/resolveKit';
import { exteriorShape, layoutExterior, layoutFloor } from '../../../lib/buildings/layout';
import { drawList, renderDraws } from '../../../lib/buildings/render';
import { KIT_TILE } from '../../../lib/buildings/kitLayout';
import { CompactSelect } from '../../common/Fields';
import {
  BUILDING_PREVIEW_GROUND_HEX,
  BUILDING_PREVIEW_SILHOUETTE_HEX,
} from '../../../lib/editorColors';

const SCALE = 3;
/** Ground around the exterior, in tiles, so the building reads as standing somewhere. */
const MARGIN = 2;

/** The building as it will look outside and inside, in base or in a variation of its kit. */
export function BuildingPreview({
  building,
  floor,
  kit,
}: {
  building: Building;
  floor: number;
  kit: ResolvedKit | null;
}) {
  const [view, setView] = useState<'exterior' | 'interior'>('exterior');
  const [variation, setVariation] = useState('');
  const ref = useRef<HTMLCanvasElement>(null);
  const shownVariation = kit?.variationIds.includes(variation) ? variation : '';
  const tile = KIT_TILE * SCALE;
  const exterior = view === 'exterior';
  const shape = exteriorShape(building);
  // Room for a character beside the building, for scale.
  const columns = exterior ? shape.columns + 1 + MARGIN * 2 : building.width;
  const rows = exterior ? shape.rows + MARGIN * 2 : building.depth;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !kit) return;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const chain = shownVariation ? [shownVariation] : [];
    if (!exterior) {
      renderDraws(
        drawList(layoutFloor(building, floor).placements, kit, chain),
        kit,
        context,
        SCALE,
      );
      return;
    }
    context.fillStyle = BUILDING_PREVIEW_GROUND_HEX;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(MARGIN * tile, MARGIN * tile);
    renderDraws(drawList(layoutExterior(building), kit, chain), kit, context, SCALE);
    // A character standing beside the building, for scale.
    context.fillStyle = BUILDING_PREVIEW_SILHOUETTE_HEX;
    const feet = shape.rows * tile;
    context.fillRect(shape.columns * tile + 4 * SCALE, feet - 32 * SCALE, 8 * SCALE, 32 * SCALE);
    context.restore();
  });

  return (
    <VStack align="stretch" spacing={3} p={4} h="full" overflow="auto">
      <HStack>
        <ButtonGroup size="xs" isAttached variant="outline">
          <Button isActive={exterior} onClick={() => setView('exterior')}>
            Exterior
          </Button>
          <Button isActive={!exterior} onClick={() => setView('interior')}>
            Interior
          </Button>
        </ButtonGroup>
        <CompactSelect
          aria-label="Preview variation"
          w="auto"
          value={shownVariation}
          onChange={(e) => setVariation(e.target.value)}
        >
          <option value="">Base</option>
          {kit?.variationIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </CompactSelect>
      </HStack>
      {kit ? (
        <canvas
          ref={ref}
          aria-label={`${view} preview`}
          width={columns * tile}
          height={rows * tile}
        />
      ) : (
        <Text fontSize="sm" color="editorMutedText">
          The preview appears once the building has a kit that can be read.
        </Text>
      )}
    </VStack>
  );
}
