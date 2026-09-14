import React from 'react';
import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalContent,
  ModalOverlay,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';
import {
  CommandPaletteFilter,
  CommandPaletteMatch,
  highlightText,
} from '../../lib/workspaceCommandPalette';

interface WorkspaceCommandPaletteProps {
  isOpen: boolean;
  query: string;
  filter: CommandPaletteFilter;
  results: CommandPaletteMatch[];
  selectedIndex: number;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (filter: CommandPaletteFilter) => void;
  onSelectedIndexChange: (index: number) => void;
  onOpenResult: (result: CommandPaletteMatch, options?: { pin?: boolean }) => void;
}

const FILTER_OPTIONS: Array<{ id: CommandPaletteFilter; label: string }> = [
  { id: 'locations', label: 'Locations' },
  { id: 'tilesets', label: 'Tilesets' },
  { id: 'entities', label: 'Entities' },
  { id: 'actors', label: 'Actors' },
  { id: 'items', label: 'Items' },
  { id: 'dialogues', label: 'Dialogues' },
];

export const WorkspaceCommandPalette: React.FC<WorkspaceCommandPaletteProps> = ({
  isOpen,
  query,
  filter,
  results,
  selectedIndex,
  onClose,
  onQueryChange,
  onFilterChange,
  onSelectedIndexChange,
  onOpenResult,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const clickTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const nextIndex =
      results.length === 0 ? -1 : Math.min(Math.max(selectedIndex, 0), results.length - 1);
    if (nextIndex !== selectedIndex) {
      onSelectedIndexChange(nextIndex);
    }
  }, [isOpen, onSelectedIndexChange, results.length, selectedIndex]);

  const cycleFilter = React.useCallback(
    (direction: 1 | -1) => {
      const currentIndex = FILTER_OPTIONS.findIndex((option) => option.id === filter);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (baseIndex + direction + FILTER_OPTIONS.length) % FILTER_OPTIONS.length;
      onFilterChange(FILTER_OPTIONS[nextIndex]!.id);
    },
    [filter, onFilterChange],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (results.length === 0) return;
        onSelectedIndexChange(selectedIndex < 0 ? 0 : (selectedIndex + 1) % results.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (results.length === 0) return;
        onSelectedIndexChange(
          selectedIndex < 0
            ? results.length - 1
            : (selectedIndex - 1 + results.length) % results.length,
        );
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        cycleFilter(event.shiftKey ? -1 : 1);
        return;
      }

      if (event.key === 'Enter') {
        if (selectedIndex < 0 || selectedIndex >= results.length) return;
        event.preventDefault();
        onOpenResult(results[selectedIndex]!, {
          pin: event.ctrlKey || event.metaKey,
        });
      }
    },
    [cycleFilter, onOpenResult, onSelectedIndexChange, results, selectedIndex],
  );

  const emptyStateLabel = query.trim() ? `No results for "${query}"` : 'No recent items';
  const trimmedQuery = query.trim();
  const isGroupedRecentState = trimmedQuery.length === 0 && filter === 'all';
  const resultSections = React.useMemo(() => {
    if (!isGroupedRecentState) {
      return [{ label: null, startIndex: 0, items: results }];
    }

    const sections: Array<{
      label: string | null;
      startIndex: number;
      items: CommandPaletteMatch[];
    }> = [];
    let currentSection: {
      label: string | null;
      startIndex: number;
      items: CommandPaletteMatch[];
    } | null = null;

    results.forEach((result, index) => {
      if (!currentSection || currentSection.label !== result.resource.typeLabel) {
        currentSection = {
          label: result.resource.typeLabel,
          startIndex: index,
          items: [result],
        };
        sections.push(currentSection);
        return;
      }

      currentSection.items.push(result);
    });

    return sections;
  }, [isGroupedRecentState, results]);
  const contextLabel =
    trimmedQuery.length > 0
      ? `Results${filter !== 'all' ? ` in ${getFilterLabel(filter)}` : ''}`
      : isGroupedRecentState
        ? 'Recently opened'
        : `Recent ${getFilterLabel(filter)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      initialFocusRef={inputRef}
      motionPreset="none"
      size="md"
    >
      <ModalOverlay backdropFilter="blur(4px)" bg="blackAlpha.600" />
      <ModalContent
        bg="editorPanelBg"
        border="1px"
        borderColor="editorShellBorder"
        boxShadow="2xl"
        maxW="480px"
        overflow="hidden"
      >
        <VStack align="stretch" spacing={0} onKeyDown={handleKeyDown}>
          <HStack px={4} py={3} spacing={3} borderBottom="1px" borderColor="editorShellBorder">
            <Icon as={FiSearch} color="editorMutedText" boxSize={4} />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search resources..."
              variant="unstyled"
              fontSize="sm"
              color="editorText"
              _placeholder={{ color: 'editorMutedText' }}
            />
          </HStack>

          <HStack
            px={3}
            py={2}
            spacing={2}
            borderBottom="1px"
            borderColor="editorShellBorder"
            justify="space-between"
          >
            <Button
              size="xs"
              variant={filter === 'all' ? 'solid' : 'ghost'}
              colorScheme={filter === 'all' ? 'blue' : undefined}
              onClick={() => onFilterChange('all')}
            >
              All
            </Button>
            <Select
              size="xs"
              maxW="180px"
              value={filter === 'all' ? '' : filter}
              onChange={(event) =>
                onFilterChange((event.target.value || 'all') as CommandPaletteFilter)
              }
            >
              <option value="">All types</option>
              {FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </HStack>

          <Box
            px={4}
            py={2}
            borderBottom="1px"
            borderColor="editorShellBorder"
            bg="editorSectionBg"
          >
            <Text
              fontSize="10px"
              fontWeight="black"
              color="editorMutedText"
              textTransform="uppercase"
              letterSpacing="widest"
            >
              {contextLabel}
            </Text>
          </Box>

          <VStack align="stretch" spacing={0} maxH="360px" overflowY="auto">
            {results.length === 0 ? (
              <Box px={4} py={6}>
                <Text fontSize="sm" color="editorMutedText">
                  {emptyStateLabel}
                </Text>
              </Box>
            ) : (
              resultSections.map((section) => (
                <Box key={`section-${section.label ?? 'results'}`}>
                  {section.label ? (
                    <Box
                      px={4}
                      py={2}
                      bg="editorSidebarBg"
                      borderBottom="1px"
                      borderColor="editorShellBorder"
                    >
                      <Text
                        fontSize="10px"
                        fontWeight="black"
                        color="editorMutedText"
                        textTransform="uppercase"
                        letterSpacing="widest"
                      >
                        {section.label}
                      </Text>
                    </Box>
                  ) : null}
                  {section.items.map((result, itemIndex) => {
                    const resultIndex = section.startIndex + itemIndex;
                    const isSelected = resultIndex === selectedIndex;
                    const labelSegments = highlightText(
                      result.resource.label,
                      result.labelMatchIndices,
                    );
                    const secondarySegments =
                      result.resource.secondaryLabel && result.secondaryMatchIndices.length > 0
                        ? highlightText(
                            result.resource.secondaryLabel,
                            result.secondaryMatchIndices,
                          )
                        : null;

                    return (
                      <Box
                        key={result.resource.key}
                        px={4}
                        py={3}
                        cursor="pointer"
                        bg={isSelected ? 'editorHoverBg' : 'transparent'}
                        borderBottom="1px"
                        borderColor="editorShellBorder"
                        onMouseEnter={() => onSelectedIndexChange(resultIndex)}
                        onClick={() => {
                          if (clickTimeoutRef.current) {
                            clearTimeout(clickTimeoutRef.current);
                          }
                          clickTimeoutRef.current = setTimeout(() => {
                            onOpenResult(result);
                            clickTimeoutRef.current = null;
                          }, 180);
                        }}
                        onDoubleClick={() => {
                          if (clickTimeoutRef.current) {
                            clearTimeout(clickTimeoutRef.current);
                            clickTimeoutRef.current = null;
                          }
                          onOpenResult(result, { pin: true });
                        }}
                      >
                        <HStack align="start" justify="space-between" spacing={3}>
                          <VStack align="stretch" spacing={1} flex={1} minW={0}>
                            <Text
                              fontSize="sm"
                              fontWeight="semibold"
                              color="editorText"
                              noOfLines={1}
                            >
                              {labelSegments.map((segment, segmentIndex) => (
                                <Text
                                  as="span"
                                  key={`${result.resource.key}-label-${segmentIndex}`}
                                  color={segment.highlighted ? 'blue.200' : 'inherit'}
                                >
                                  {segment.text}
                                </Text>
                              ))}
                            </Text>
                            {result.matchedField === 'secondary' &&
                            result.resource.secondaryLabel ? (
                              <Text fontSize="xs" color="editorMutedText" noOfLines={1}>
                                {secondarySegments?.map((segment, segmentIndex) => (
                                  <Text
                                    as="span"
                                    key={`${result.resource.key}-secondary-${segmentIndex}`}
                                    color={segment.highlighted ? 'blue.200' : 'inherit'}
                                  >
                                    {segment.text}
                                  </Text>
                                ))}
                              </Text>
                            ) : null}
                          </VStack>
                          {!isGroupedRecentState ? (
                            <Text
                              fontSize="xs"
                              color="editorMutedText"
                              textTransform="uppercase"
                              letterSpacing="wide"
                              flexShrink={0}
                            >
                              {result.resource.typeLabel}
                            </Text>
                          ) : null}
                        </HStack>
                      </Box>
                    );
                  })}
                </Box>
              ))
            )}
          </VStack>
        </VStack>
      </ModalContent>
    </Modal>
  );
};

export const WorkspaceCommandPaletteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <IconButton
    aria-label="Open command palette"
    icon={<FiSearch />}
    size="xs"
    variant="ghost"
    onClick={onClick}
  />
);

export default WorkspaceCommandPalette;

function getFilterLabel(filter: CommandPaletteFilter): string {
  if (filter === 'all') return 'All';
  return FILTER_OPTIONS.find((option) => option.id === filter)?.label ?? 'All';
}
