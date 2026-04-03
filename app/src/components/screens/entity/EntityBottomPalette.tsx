import React, { useMemo, useState, useEffect } from 'react';
import { Box, Flex, HStack, Text, Select, VStack, Tooltip } from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';
import { useEditorStore } from '../../../store/useEditorStore';
import { EntityType } from '../../../types/schema';

/**
 * EntityBottomPalette — bottom panel replacement for the tileset palette when an entity layer is active.
 * Shows a group dropdown and a horizontal list of entity types in the selected group.
 */
export const EntityBottomPalette: React.FC = () => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  const activeTool = useEditorStore((state) => state.activeTool);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const et of entityTypes) {
      const g = et.group || 'Ungrouped';
      if (!seen.has(g)) {
        seen.add(g);
        result.push(g);
      }
    }
    return result.sort((a, b) => {
      if (a === 'Ungrouped') return 1;
      if (b === 'Ungrouped') return -1;
      return a.localeCompare(b);
    });
  }, [entityTypes]);

  const [selectedGroup, setSelectedGroup] = useState<string>(() => groups[0] ?? '');

  const handleGroupChange = (group: string) => {
    setSelectedGroup(group);
    // If on placement tool, immediately select first entity of the new group
    if (activeTool === 'entityPlace') {
      const first = entityTypes.find((et) => (et.group || 'Ungrouped') === group);
      if (first) setSelectedEntityType(first.id);
    }
  };

  // Keep selectedGroup valid if groups change
  const effectiveGroup = groups.includes(selectedGroup) ? selectedGroup : (groups[0] ?? '');

  const items = useMemo(
    () => entityTypes.filter((et) => (et.group || 'Ungrouped') === effectiveGroup),
    [entityTypes, effectiveGroup],
  );

  // When switching to entityPlace with no valid selection, auto-select first item in current group
  useEffect(() => {
    if (activeTool !== 'entityPlace') return;
    const currentIsInGroup = items.some((et) => et.id === selectedEntityTypeId);
    if (!currentIsInGroup && items.length > 0) {
      setSelectedEntityType(items[0].id);
    }
  }, [activeTool, items, selectedEntityTypeId, setSelectedEntityType]);

  if (entityTypes.length === 0) {
    return (
      <Flex h="full" align="center" justify="center" p={4}>
        <Text fontSize="xs" color="gray.600">
          No entity types defined. Create some in the Entity Editor.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editor.panelBg">
      {/* Header row with group dropdown */}
      <PanelHeader
        left={
          <HStack spacing={3}>
            <Select
              size="xs"
              variant="filled"
              bg="editor.viewportBg"
              borderColor="editor.inputBorder"
              _hover={{ bg: 'editor.border' }}
              value={effectiveGroup}
              onChange={(e) => handleGroupChange(e.target.value)}
              color="blue.300"
              fontSize="10px"
              fontWeight="bold"
              h="6"
              maxW="180px"
            >
              {groups.map((g) => (
                <option key={g} value={g} style={{ background: '#171923' }}>
                  {g.toUpperCase()}
                </option>
              ))}
            </Select>
            <Text fontSize="9px" color="gray.600">
              {items.length} type{items.length !== 1 ? 's' : ''}
            </Text>
          </HStack>
        }
      />

      {/* Entity type grid */}
      <Box flex={1} overflowX="auto" overflowY="hidden">
        <HStack spacing={1} px={2} py={2} h="full" align="center">
          {items.map((et: EntityType) => {
            const isSelected = et.id === selectedEntityTypeId;
            return (
              <Tooltip key={et.id} label={et.displayName} fontSize="xs" hasArrow openDelay={400}>
                <VStack
                  spacing={1}
                  align="center"
                  cursor="pointer"
                  p={1.5}
                  borderRadius="md"
                  border="2px"
                  borderColor={isSelected ? 'blue.400' : 'transparent'}
                  bg={isSelected ? 'blue.900' : 'whiteAlpha.50'}
                  _hover={{ bg: isSelected ? 'blue.900' : 'whiteAlpha.100' }}
                  onClick={() => setSelectedEntityType(et.id)}
                  minW="48px"
                  flexShrink={0}
                >
                  <Box
                    w="28px"
                    h="28px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    bg={et.placeholderColor}
                    borderRadius="sm"
                    fontSize="14px"
                  >
                    {et.icon || '📦'}
                  </Box>
                  <Text
                    fontSize="9px"
                    color={isSelected ? 'white' : 'gray.400'}
                    noOfLines={1}
                    maxW="52px"
                    textAlign="center"
                  >
                    {et.displayName}
                  </Text>
                </VStack>
              </Tooltip>
            );
          })}
        </HStack>
      </Box>
    </Flex>
  );
};
