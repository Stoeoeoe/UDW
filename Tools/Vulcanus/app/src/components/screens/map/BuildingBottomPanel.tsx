import React, { useState } from 'react';
import { Box, Button, Flex, HStack, Icon, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { FiHome } from 'react-icons/fi';
import PanelHeader from '../../common/PanelHeader';
import { CompactInput } from '../../common/Fields';
import { useEditorStore } from '../../../store/useEditorStore';
import { placementRefusal } from '../../../lib/buildings/mapPlacement';
import { BuildingThumbnail } from '../../navigation/BuildingThumbnail';
import { OpenResourceButton } from '../../workspace/OpenResourceButton';

const placeholder = (
  <Flex boxSize="48px" align="center" justify="center" flexShrink={0}>
    <Icon as={FiHome} boxSize={5} />
  </Flex>
);

/** Buildings to place on the selected building layer, and the placed one that is selected. */
export const BuildingBottomPanel: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap)!;
  const maps = useEditorStore((state) => state.maps);
  const buildings = useEditorStore((state) => state.buildings);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const paletteBuildingId = useEditorStore((state) => state.paletteBuildingId);
  const selectedInstanceId = useEditorStore((state) => state.selectedBuildingInstanceId);
  const inVariation = useEditorStore((state) => !!state.activeVariationId);
  const [search, setSearch] = useState('');

  const layer = currentMap.layers.find((entry) => entry.id === selectedLayerId)!;
  const instance = layer.buildings?.find((entry) => entry.id === selectedInstanceId);
  const placed = instance && buildings.find((entry) => entry.id === instance.buildingId);
  const chosen = buildings.find((entry) => entry.id === paletteBuildingId);
  const refusal = chosen ? placementRefusal(maps, currentMap, chosen) : null;
  const shown = buildings.filter((building) =>
    `${building.name} ${building.id}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const choose = (buildingId: string) => {
    const state = useEditorStore.getState();
    state.setPaletteBuilding(buildingId);
    state.setActiveTool('buildingPlace');
  };

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      <PanelHeader
        title="Buildings"
        subtitle="Pick a building and click the map to place it, its door under the pointer"
      />
      <HStack align="stretch" flex={1} minH={0} spacing={0}>
        <VStack align="stretch" flex={1} minW={0} p={3} spacing={2} overflow="auto">
          <CompactInput
            aria-label="Search buildings"
            placeholder="Search buildings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {refusal && (
            <Text fontSize="xs" color="editorDangerText">
              {refusal}
            </Text>
          )}
          <SimpleGrid minChildWidth="96px" spacing={2}>
            {shown.map((building) => (
              <Button
                key={building.id}
                aria-label={`Place ${building.name}`}
                aria-pressed={building.id === paletteBuildingId}
                variant="ghost"
                h="auto"
                py={2}
                flexDirection="column"
                gap={1}
                isActive={building.id === paletteBuildingId}
                onClick={() => choose(building.id)}
              >
                <BuildingThumbnail buildingId={building.id} fallback={placeholder} size="48px" />
                <Text fontSize="xs" noOfLines={1}>
                  {building.name}
                </Text>
              </Button>
            ))}
          </SimpleGrid>
          {buildings.length === 0 && (
            <Text fontSize="sm" color="editorMutedText">
              No buildings yet. Create one in the Buildings editor.
            </Text>
          )}
        </VStack>
        {instance && placed && (
          <Box w="240px" flexShrink={0} p={3} borderLeftWidth="1px" borderColor="editorShellBorder">
            <HStack justify="space-between">
              <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                {placed.name}
              </Text>
              <OpenResourceButton
                resource={{ type: 'building', id: placed.id }}
                label="Open building"
              />
            </HStack>
            <Text fontSize="xs" color="editorMutedText" mb={2}>
              Footprint at ({instance.x}, {instance.y})
            </Text>
            <Button
              size="xs"
              variant="outline"
              colorScheme="red"
              isDisabled={inVariation || layer.locked}
              title={inVariation ? 'Buildings are placed on the base map.' : undefined}
              onClick={() => useEditorStore.getState().removeBuilding(layer.id, instance.id)}
            >
              Remove from map
            </Button>
          </Box>
        )}
      </HStack>
    </Flex>
  );
};
