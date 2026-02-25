import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  IconButton,
  Tooltip,
  Badge,
  useDisclosure,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { Variation } from '../../../types/schema';
import { CreateVariationDialog } from './CreateVariationDialog';

/** Season definitions for the segmented toggle */
const SEASONS = [
  { id: 'spring', label: 'Spring', icon: '🌸', color: 'pink' },
  { id: 'summer', label: 'Summer', icon: '☀️', color: 'yellow' },
  { id: 'autumn', label: 'Autumn', icon: '🍂', color: 'orange' },
  { id: 'winter', label: 'Winter', icon: '❄️', color: 'cyan' },
] as const;

/**
 * Builds a tree structure of variations, grouping children under parents.
 * Root variations (no parent) are at the top level.
 */
function buildVariationTree(variations: Variation[]): {
  seasons: Variation[];
  generic: Variation[];
  childrenOf: Record<string, Variation[]>;
} {
  const seasons: Variation[] = [];
  const generic: Variation[] = [];
  const childrenOf: Record<string, Variation[]> = {};

  for (const v of variations) {
    if (v.kind === 'season') {
      seasons.push(v);
    }
    if (v.parentId) {
      if (!childrenOf[v.parentId]) childrenOf[v.parentId] = [];
      childrenOf[v.parentId].push(v);
    } else if (v.kind === 'generic') {
      generic.push(v);
    }
  }

  return { seasons, generic, childrenOf };
}

/**
 * VariationManager - Manages map variations with:
 * - Season toggle buttons (first-class citizens)
 * - Generic variation list with parent/child nesting
 * - Create/delete variation controls
 * - Time preview toggle (future)
 */
export const VariationManager: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const setActiveVariation = useEditorStore(
    (state) => state.setActiveVariation,
  );
  const removeVariation = useEditorStore((state) => state.removeVariation);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const variations = useMemo(
    () => currentMap?.variations || [],
    [currentMap?.variations],
  );

  const tree = useMemo(() => buildVariationTree(variations), [variations]);

  // Check which seasons are defined
  const definedSeasons = useMemo(() => {
    const set = new Set<string>();
    tree.seasons.forEach((s) => set.add(s.id));
    return set;
  }, [tree.seasons]);

  // Get the currently active seasonal ancestor (if any)
  const activeSeasonId = useMemo(() => {
    if (!activeVariationId) return null;
    // Walk up the parent chain to find the season root
    let current = variations.find((v) => v.id === activeVariationId);
    while (current) {
      if (current.kind === 'season') return current.id;
      current = current.parentId
        ? variations.find((v) => v.id === current!.parentId)
        : undefined;
    }
    return null;
  }, [activeVariationId, variations]);

  const handleDeleteVariation = (id: string) => {
    if (confirmDeleteId === id) {
      // Also remove any children first
      const toRemove = collectDescendants(id, variations);
      toRemove.forEach((vid) => removeVariation(vid));
      removeVariation(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  if (!currentMap) {
    return (
      <Box p={4} textAlign="center">
        <Text fontSize="xs" color="gray.600" fontStyle="italic">
          Select a map to manage variations
        </Text>
      </Box>
    );
  }

  /**
   * Renders a variation item with optional nesting depth
   */
  const renderVariationItem = (v: Variation, depth: number = 0) => {
    const isActive = activeVariationId === v.id;
    const isConfirming = confirmDeleteId === v.id;
    const children = tree.childrenOf[v.id] || [];
    const hasChildren = children.length > 0;

    return (
      <React.Fragment key={v.id}>
        <HStack
          spacing={0}
          px={2}
          py={1}
          pl={2 + depth * 4}
          cursor="pointer"
          bg={isActive ? 'whiteAlpha.100' : 'transparent'}
          borderLeft="2px"
          borderColor={isActive ? 'blue.400' : 'transparent'}
          _hover={{ bg: isActive ? 'whiteAlpha.100' : 'whiteAlpha.50' }}
          transition="all 0.1s"
          onClick={() => setActiveVariation(v.id)}
          role="group"
        >
          {depth > 0 && (
            <Text fontSize="xs" color="gray.600" mr={1}>
              ↳
            </Text>
          )}

          <VStack align="start" spacing={0} flex={1} minW={0}>
            <HStack spacing={1}>
              <Text
                fontSize="xs"
                fontWeight={isActive ? 'bold' : 'medium'}
                color={isActive ? 'white' : 'gray.300'}
                noOfLines={1}
              >
                {v.displayName}
              </Text>
              {v.tilesetSuffix && (
                <Badge
                  fontSize="8px"
                  colorScheme="purple"
                  variant="subtle"
                  px={1}
                  py={0}
                  borderRadius="sm"
                >
                  {v.tilesetSuffix}
                </Badge>
              )}
            </HStack>
            {hasChildren && (
              <Text fontSize="9px" color="gray.600">
                {children.length} child variation
                {children.length !== 1 ? 's' : ''}
              </Text>
            )}
          </VStack>

          <IconButton
            aria-label="Delete Variation"
            icon={<DeleteIcon fontSize="9px" />}
            size="xs"
            variant="ghost"
            color={isConfirming ? 'red.300' : 'gray.600'}
            bg={isConfirming ? 'red.900' : 'transparent'}
            opacity={isConfirming ? 1 : 0}
            _groupHover={{ opacity: 1 }}
            _hover={{ color: 'red.300', bg: 'red.900' }}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteVariation(v.id);
            }}
            title={
              isConfirming
                ? 'Click again to confirm (deletes children too)'
                : 'Delete variation'
            }
          />
        </HStack>

        {/* Render children recursively */}
        {children.map((child) => renderVariationItem(child, depth + 1))}
      </React.Fragment>
    );
  };

  // Generic root variations (no parent, kind=generic)
  const rootGenerics = tree.generic;

  return (
    <Flex direction="column" h="full">
      {/* Variations Header */}
      <Flex
        p="3"
        borderBottom="1px"
        borderColor="editor.border"
        align="center"
        justify="space-between"
        bg="editor.headerBg"
      >
        <Text
          fontSize="10px"
          fontWeight="black"
          textTransform="uppercase"
          letterSpacing="widest"
          color="gray.500"
        >
          Variations
        </Text>
        <Tooltip label="Create Variation" placement="right" hasArrow>
          <IconButton
            aria-label="Create Variation"
            icon={<AddIcon fontSize="10px" />}
            size="xs"
            variant="ghost"
            color="gray.400"
            _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
            onClick={onOpen}
          />
        </Tooltip>
      </Flex>

      <Box flex={1} overflowY="auto" p={1}>
        <VStack spacing={0} align="stretch">
          {/* Base Map Row (always present) */}
          <HStack
            spacing={2}
            px={2}
            py={1.5}
            cursor="pointer"
            bg={activeVariationId === null ? 'whiteAlpha.100' : 'transparent'}
            borderLeft="2px"
            borderColor={
              activeVariationId === null ? 'green.400' : 'transparent'
            }
            _hover={{
              bg:
                activeVariationId === null ? 'whiteAlpha.100' : 'whiteAlpha.50',
            }}
            transition="all 0.1s"
            onClick={() => setActiveVariation(null)}
          >
            <Text fontSize="sm" opacity={0.5}>
              🌍
            </Text>
            <Text
              fontSize="xs"
              fontWeight={activeVariationId === null ? 'bold' : 'medium'}
              color={activeVariationId === null ? 'white' : 'gray.400'}
            >
              Base Map
            </Text>
          </HStack>

          {/* Season Toggles Section */}
          {(tree.seasons.length > 0 || variations.length > 0) && (
            <Box px={2} pt={3} pb={1}>
              <Text
                fontSize="9px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.600"
                mb={1.5}
              >
                Seasons
              </Text>
              <HStack spacing={1}>
                {SEASONS.map((season) => {
                  const isDefined = definedSeasons.has(season.id);
                  const isActiveSeason = activeSeasonId === season.id;

                  return (
                    <Tooltip
                      key={season.id}
                      label={
                        isDefined
                          ? season.label
                          : `${season.label} (not defined)`
                      }
                      hasArrow
                      placement="top"
                    >
                      <Box
                        flex={1}
                        textAlign="center"
                        py={1.5}
                        px={1}
                        borderRadius="md"
                        cursor={isDefined ? 'pointer' : 'default'}
                        bg={
                          isActiveSeason ? `${season.color}.900` : 'transparent'
                        }
                        borderWidth="1px"
                        borderColor={
                          isActiveSeason
                            ? `${season.color}.600`
                            : isDefined
                              ? 'gray.700'
                              : 'transparent'
                        }
                        opacity={isDefined ? 1 : 0.3}
                        _hover={
                          isDefined
                            ? {
                                bg: isActiveSeason
                                  ? `${season.color}.900`
                                  : 'whiteAlpha.50',
                                borderColor: `${season.color}.600`,
                              }
                            : {}
                        }
                        transition="all 0.15s"
                        onClick={() => {
                          if (!isDefined) return;
                          // Toggle: click active season to deactivate (go to base)
                          if (
                            isActiveSeason &&
                            activeVariationId === season.id
                          ) {
                            setActiveVariation(null);
                          } else {
                            setActiveVariation(season.id);
                          }
                        }}
                      >
                        <Text fontSize="sm" lineHeight={1}>
                          {season.icon}
                        </Text>
                        <Text
                          fontSize="8px"
                          fontWeight="bold"
                          color={
                            isActiveSeason ? `${season.color}.200` : 'gray.500'
                          }
                          mt={0.5}
                        >
                          {season.label.slice(0, 3).toUpperCase()}
                        </Text>
                      </Box>
                    </Tooltip>
                  );
                })}
              </HStack>
            </Box>
          )}

          {/* Generic Variations Section */}
          {(rootGenerics.length > 0 ||
            tree.seasons.some(
              (s) => (tree.childrenOf[s.id] || []).length > 0,
            )) && (
            <Box pt={3}>
              <Text
                fontSize="9px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.600"
                px={2}
                mb={1}
              >
                Variations
              </Text>

              {/* Season children (e.g., spring → spring_festival) */}
              {tree.seasons.map((season) => {
                const children = tree.childrenOf[season.id] || [];
                if (children.length === 0) return null;

                return (
                  <Box key={season.id}>
                    <Text
                      fontSize="9px"
                      color="gray.600"
                      px={2}
                      py={0.5}
                      fontStyle="italic"
                    >
                      Under {season.displayName}:
                    </Text>
                    {children.map((child) => renderVariationItem(child, 1))}
                  </Box>
                );
              })}

              {/* Root generic variations (no parent) */}
              {rootGenerics.map((v) => renderVariationItem(v, 0))}
            </Box>
          )}

          {/* Empty state */}
          {variations.length === 0 && (
            <Box px={3} py={4} textAlign="center">
              <Text fontSize="xs" color="gray.600" fontStyle="italic">
                No variations defined
              </Text>
              <Text fontSize="10px" color="gray.700" mt={1}>
                Create seasons or contextual variations to override map content
              </Text>
            </Box>
          )}
        </VStack>
      </Box>

      {/* Create Variation Dialog */}
      <CreateVariationDialog
        isOpen={isOpen}
        onClose={onClose}
        existingVariations={variations}
      />
    </Flex>
  );
};

/** Collect all descendant variation IDs recursively */
function collectDescendants(
  parentId: string,
  variations: Variation[],
): string[] {
  const result: string[] = [];
  const children = variations.filter((v) => v.parentId === parentId);
  for (const child of children) {
    result.push(child.id);
    result.push(...collectDescendants(child.id, variations));
  }
  return result;
}
