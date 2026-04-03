import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Flex,
  Badge,
  Input,
  InputGroup,
  InputLeftElement,
  Tooltip,
} from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';
import { SearchIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { EntityType } from '../../../types/schema';

/**
 * EntityPalette – Right sidebar panel for entity placement mode.
 * Displays all entity types grouped by their `group` field with collapsible sections.
 * Selecting an entity type arms it for placement on the map.
 */
export const EntityPalette: React.FC = () => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const selectedEntityTypeId = useEditorStore(
    (state) => state.selectedEntityTypeId,
  );
  const setSelectedEntityType = useEditorStore(
    (state) => state.setSelectedEntityType,
  );
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return entityTypes;
    const q = search.toLowerCase();
    return entityTypes.filter(
      (et) =>
        et.displayName.toLowerCase().includes(q) ||
        et.id.toLowerCase().includes(q) ||
        et.category.toLowerCase().includes(q) ||
        (et.group || '').toLowerCase().includes(q),
    );
  }, [entityTypes, search]);

  // Group entities
  const grouped = useMemo(() => {
    const groups: Record<string, EntityType[]> = {};
    for (const et of filtered) {
      const groupName = et.group || 'Ungrouped';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(et);
    }
    return groups;
  }, [filtered]);

  const groupNames = Object.keys(grouped).sort((a, b) => {
    if (a === 'Ungrouped') return 1;
    if (b === 'Ungrouped') return -1;
    return a.localeCompare(b);
  });

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (entityTypes.length === 0) {
    return (
      <Flex direction="column" h="full" bg="editor.panelBg">
        <PanelHeader title="Entities" />
        <VStack flex={1} justify="center" spacing={2} p={4}>
          <Text fontSize="2xl">🎯</Text>
          <Text
            fontSize="xs"
            color="gray.600"
            textAlign="center"
            fontStyle="italic"
          >
            No entity types defined
          </Text>
          <Text fontSize="10px" color="gray.700" textAlign="center">
            Go to the Entity Editor mode to create entity types
          </Text>
        </VStack>
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full" bg="editor.panelBg" overflow="hidden">
      {/* Header */}
      <PanelHeader
        title="Entities"
        actions={(
          <HStack spacing={2}>
            <Badge fontSize="9px" colorScheme="gray" variant="subtle">
              {entityTypes.length}
            </Badge>
          </HStack>
        )}
      />

      {/* Search */}
      {entityTypes.length > 5 && (
        <Box px={2} py={2} borderBottom="1px" borderColor="editor.border">
          <InputGroup size="xs">
            <InputLeftElement pointerEvents="none">
              <SearchIcon color="gray.600" fontSize="10px" />
            </InputLeftElement>
            <Input
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              placeholder="Filter entities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              _placeholder={{ color: 'gray.700' }}
            />
          </InputGroup>
        </Box>
      )}

      {/* Grouped entity list */}
      <Box flex={1} overflowY="auto">
        {filtered.length === 0 && search && (
          <Text
            fontSize="xs"
            color="gray.600"
            textAlign="center"
            py={6}
            fontStyle="italic"
          >
            No matching entities
          </Text>
        )}

        {groupNames.map((groupName) => {
          const isCollapsed = collapsedGroups.has(groupName);
          const items = grouped[groupName];

          return (
            <Box key={groupName}>
              {/* Group header */}
              <HStack
                px={3}
                py={1.5}
                cursor="pointer"
                _hover={{ bg: 'whiteAlpha.50' }}
                onClick={() => toggleGroup(groupName)}
                spacing={1}
                userSelect="none"
              >
                <Text fontSize="10px" color="gray.600" w="10px">
                  {isCollapsed ? '▸' : '▾'}
                </Text>
                <Text
                  fontSize="10px"
                  fontWeight="black"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="gray.500"
                  flex={1}
                >
                  {groupName}
                </Text>
                <Text fontSize="10px" color="gray.700">
                  {items.length}
                </Text>
              </HStack>

              {/* Items */}
              {!isCollapsed && (
                <VStack spacing={0} align="stretch" pb={1}>
                  {items.map((et) => {
                    const isSelected = et.id === selectedEntityTypeId;
                    return (
                      <Tooltip
                        key={et.id}
                        label={et.description || et.displayName}
                        placement="left"
                        hasArrow
                        openDelay={500}
                      >
                        <HStack
                          px={3}
                          py={1.5}
                          pl={6}
                          spacing={2}
                          cursor="pointer"
                          bg={isSelected ? 'blue.900' : 'transparent'}
                          borderLeft="2px"
                          borderColor={isSelected ? 'blue.400' : 'transparent'}
                          _hover={{
                            bg: isSelected ? 'blue.900' : 'whiteAlpha.50',
                          }}
                          transition="all 0.1s"
                          onClick={() => setSelectedEntityType(et.id)}
                        >
                          <Box
                            w="22px"
                            h="22px"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            bg={et.placeholderColor}
                            borderRadius="sm"
                            fontSize="12px"
                            flexShrink={0}
                          >
                            {et.icon || '📦'}
                          </Box>
                          <VStack spacing={0} align="start" flex={1} minW={0}>
                            <Text
                              fontSize="xs"
                              fontWeight={isSelected ? 'bold' : 'medium'}
                              color={isSelected ? 'white' : 'gray.300'}
                              noOfLines={1}
                            >
                              {et.displayName}
                            </Text>
                            <Text fontSize="9px" color="gray.600" noOfLines={1}>
                              {et.category}
                              {et.properties.length > 0 &&
                                ` • ${et.properties.length} props`}
                            </Text>
                          </VStack>
                        </HStack>
                      </Tooltip>
                    );
                  })}
                </VStack>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Help tip */}
      <Box
        px={3}
        py={2}
        borderTop="1px"
        borderColor="editor.border"
        flexShrink={0}
      >
        <Text fontSize="9px" color="gray.600" textAlign="center">
          Select an entity, then click on the map to place it
        </Text>
      </Box>
    </Flex>
  );
};
