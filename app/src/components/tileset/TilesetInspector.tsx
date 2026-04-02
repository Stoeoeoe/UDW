import React from 'react';
import { VStack, HStack, Text, Box, Select } from '@chakra-ui/react';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset, TileDefinition } from '../../types/schema';
import { TileCollisionEditor } from './TileCollisionEditor';

interface TilesetInspectorProps {
  tileset: Tileset;
  selectedIndex?: number | null;
}

export const TilesetInspector: React.FC<TilesetInspectorProps> = ({
  tileset,
  selectedIndex: propSelectedIndex,
}) => {
  const storeSelectedIndex = useEditorStore((state) => state.selectedTileIndex);
  const selectedIndex =
    typeof propSelectedIndex !== 'undefined'
      ? propSelectedIndex
      : storeSelectedIndex;
  const updateTileDef = useEditorStore((state) => state.updateTileDefinition);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const sprite = loadedSprites.get(tileset.spriteSheet);

  // Selection & terrain helpers
  const selectedTileDef: TileDefinition =
    selectedIndex !== null ? tileset.tiles[selectedIndex] || {} : {};

  return (
    <VStack align="stretch" spacing={6} p={6}>
      <VStack align="start" spacing={1} mb={2}>
        <Text
          fontSize="xs"
          fontWeight="black"
          color="gray.500"
          textTransform="uppercase"
          letterSpacing="widest"
        >
          Tile Properties
        </Text>
      </VStack>

      {selectedIndex === null ? (
        <VStack mt="10" spacing={2} textAlign="center" opacity={0.5}>
          <Text color="gray.500" fontSize="sm">
            No tile selected
          </Text>
          <Text fontSize="10px" color="gray.600">
            Click a tile in the viewer
          </Text>
        </VStack>
      ) : (
        <VStack align="stretch" spacing={5}>
          <VStack align="start" spacing={1}>
            <Text fontSize="2xl" fontWeight="black" color="white">
              #{selectedIndex}
            </Text>
            <Text fontSize="xs" color="gray.500" textTransform="uppercase">
              Atlas Index
            </Text>
          </VStack>

          <PropertyForm
            schema={
              [
                {
                  key: 'id',
                  label: 'Semantic ID',
                  type: 'string',
                  description: 'Human-friendly semantic identifier',
                },
                {
                  key: 'probability',
                  label: 'Probability',
                  type: 'number',
                  description:
                    'Weight for random tile selection (higher = more likely)',
                },
                {
                  key: 'terrain',
                  label: 'Terrain (Main)',
                  type: 'custom',
                  customRenderer: (value: any, onChange: (v: any) => void) => {
                    const options: {
                      id: string;
                      name: string;
                      color?: string;
                    }[] = [];
                    if (tileset.wangSets) {
                      for (const ws of tileset.wangSets) {
                        for (const wc of ws.colors) {
                          options.push({
                            id: `${ws.id}:${wc.id}`,
                            name: `${ws.name} — ${wc.name}`,
                            color: wc.color,
                          });
                        }
                      }
                    }

                    return (
                      <HStack spacing={3} align="center">
                        <Box
                          w={3}
                          h={3}
                          rounded="full"
                          bg={
                            options.find((o) => o.id === value)?.color ||
                            'transparent'
                          }
                          borderWidth={1}
                          borderColor="gray.700"
                        />
                        <Select
                          size="sm"
                          bg="#05060a"
                          borderColor="#0b1116"
                          color="white"
                          value={value || ''}
                          onChange={(e) => onChange(e.target.value)}
                        >
                          <option value="">None</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Select>
                      </HStack>
                    );
                  },
                },
              ] as PropertySchema[]
            }
            values={{
              id: selectedTileDef.id || '',
              probability: selectedTileDef.probability ?? 1,
              terrain: selectedTileDef.terrain || '',
            }}
            onChange={(k, v) => {
              if (!tileset || selectedIndex === null) return;
              if (k === 'id')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  id: v,
                });
              if (k === 'probability')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  probability: parseFloat(v) || 1,
                });
              if (k === 'terrain')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  terrain: v,
                });
            }}
          />

          <TileCollisionEditor
            tileWidth={tileset.tileWidth}
            tileHeight={tileset.tileHeight}
            tileIndex={selectedIndex}
            tilesetColumns={tileset.columns}
            sprite={sprite}
            collision={selectedTileDef.collision}
            onChange={(collision) => {
              if (!tileset || selectedIndex === null) return;
              updateTileDef(tileset.id, selectedIndex, {
                ...selectedTileDef,
                collision,
              });
            }}
          />
        </VStack>
      )}
    </VStack>
  );
};
