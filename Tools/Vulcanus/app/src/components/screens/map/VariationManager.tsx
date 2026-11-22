import React, { useMemo } from 'react';
import { Flex, HStack, IconButton, Select, Text, Tooltip, useDisclosure } from '@chakra-ui/react';
import { AddIcon, EditIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { CreateVariationDialog } from './CreateVariationDialog';
import { SEASONS, SEASON_NAMES, type Season } from '../../../lib/seasons';

export const VariationManager: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const setActiveVariation = useEditorStore((state) => state.setActiveVariation);
  const previewSeason = useEditorStore((state) => state.previewSeason);
  const setPreviewSeason = useEditorStore((state) => state.setPreviewSeason);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const variations = useMemo(() => currentMap?.variations || [], [currentMap?.variations]);
  const seasonVariations = useMemo(
    () => variations.filter((variation) => variation.kind === 'season'),
    [variations],
  );
  const genericVariations = useMemo(
    () => variations.filter((variation) => variation.kind === 'generic'),
    [variations],
  );

  const renderGroupedOptions = () => {
    const options: React.ReactNode[] = [
      <option key="__base__" value="">
        Base Map
      </option>,
    ];

    if (seasonVariations.length > 0) {
      options.push(
        <optgroup key="seasons" label="Seasons">
          {seasonVariations.map((variation) => (
            <option key={variation.id} value={variation.id}>
              {variation.displayName}
            </option>
          ))}
        </optgroup>,
      );
    }

    if (genericVariations.length > 0) {
      options.push(
        <optgroup key="generic" label="Generic">
          {genericVariations.map((variation) => (
            <option key={variation.id} value={variation.id}>
              {variation.displayName}
            </option>
          ))}
        </optgroup>,
      );
    }

    return options;
  };

  if (!currentMap) {
    return (
      <Flex p={4} align="center" justify="center">
        <Text fontSize="xs" color="gray.600" fontStyle="italic">
          Select a location to manage variations
        </Text>
      </Flex>
    );
  }

  return (
    <>
      <Flex
        px="3"
        py="2"
        borderBottom="1px"
        borderColor="editorShellBorder"
        align="center"
        justify="space-between"
        bg="editorSectionBg"
      >
        <HStack spacing={2} align="center">
          <Text
            fontSize="10px"
            fontWeight="black"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            Variations
          </Text>

          <Select
            size="xs"
            value={activeVariationId || ''}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              setActiveVariation(event.target.value || null);
            }}
            bg="editorSectionBg"
            borderColor="transparent"
            color="gray.300"
            width="180px"
          >
            {renderGroupedOptions()}
          </Select>

          <Tooltip label="Edit Selected" placement="right" hasArrow>
            <IconButton
              aria-label="Edit Selected Variation or Map"
              icon={<EditIcon fontSize="10px" />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={(event) => {
                event.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent('openMetadataDialog', {
                    detail: { focus: activeVariationId ? 'variation' : 'base' },
                  }),
                );
              }}
              isDisabled={!currentMap}
            />
          </Tooltip>

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
        </HStack>
      </Flex>

      <Flex
        px="3"
        py="2"
        borderBottom="1px"
        borderColor="editorShellBorder"
        align="center"
        bg="editorSectionBg"
      >
        <HStack spacing={2} align="center">
          <Text
            fontSize="10px"
            fontWeight="black"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            Season
          </Text>
          <Select
            aria-label="Season"
            size="xs"
            value={previewSeason ?? ''}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setPreviewSeason((event.target.value as Season) || null)
            }
            bg="editorSectionBg"
            borderColor="transparent"
            color="gray.300"
            width="180px"
            title="Draws tiles from season twin tilesets"
          >
            <option value="">No season</option>
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                {SEASON_NAMES[season]}
              </option>
            ))}
          </Select>
        </HStack>
      </Flex>

      <CreateVariationDialog isOpen={isOpen} onClose={onClose} existingVariations={variations} />
    </>
  );
};
