import React, { useState } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Spacer,
  Divider,
  Input,
  Circle,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset, WangSet } from '../../types/schema';
import { GhostIconButton } from '../common/IconButtons';
import { CaptionText, SectionLabel } from '../common/Typography.tsx';

interface WangEditorProps {
  tileset: Tileset;
}

export const WangEditor: React.FC<WangEditorProps> = ({ tileset }) => {
  const updateTileset = useEditorStore((state) => state.updateTileset);

  const [activeSetIndex, setActiveSetIndex] = useState<number | null>(
    tileset.wangSets && tileset.wangSets.length > 0 ? 0 : null,
  );

  const wangSets = tileset.wangSets || [];
  const activeSet = activeSetIndex !== null ? wangSets[activeSetIndex] : null;

  const handleAddSet = () => {
    const newSet: WangSet = {
      id: `set-${Date.now()}`,
      name: 'New Terrain',
      type: 'corner',
      colors: [{ id: 1, name: 'Base', color: '#3182ce' }],
      tileMappings: {},
    };
    updateTileset(tileset.id, {
      wangSets: [...wangSets, newSet],
    });
    setActiveSetIndex(wangSets.length);
  };

  const handleAddColor = (setIndex: number) => {
    const nextSets = [...wangSets];
    const colors = nextSets[setIndex].colors;
    const newId = colors.length > 0 ? Math.max(...colors.map((c) => c.id)) + 1 : 1;

    nextSets[setIndex].colors.push({
      id: newId,
      name: `Level ${newId}`,
      color: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`,
    });

    updateTileset(tileset.id, { wangSets: nextSets });
  };

  return (
    <VStack align="stretch" spacing={0}>
      {/* Set Selection */}
      <Box px={4} py={3} bg="whiteAlpha.50">
        <HStack mb={2}>
          <SectionLabel textStyle="fieldLabel">Sets</SectionLabel>
          <Spacer />
          <GhostIconButton aria-label="Add Set" icon={<AddIcon />} onClick={handleAddSet} />
        </HStack>
        {wangSets.length === 0 ? (
          <CaptionText fontStyle="italic">No terrain sets</CaptionText>
        ) : (
          <VStack align="stretch" spacing={1}>
            {wangSets.map((set, idx) => (
              <Button
                key={set.id}
                size="xs"
                variant={activeSetIndex === idx ? 'solid' : 'outline'}
                borderColor={activeSetIndex === idx ? 'blue.500' : 'gray.800'}
                colorScheme={activeSetIndex === idx ? 'blue' : 'gray'}
                justifyContent="start"
                fontSize="10px"
                h="7"
                onClick={() => setActiveSetIndex(idx)}
              >
                {set.name}
              </Button>
            ))}
          </VStack>
        )}
      </Box>

      <Divider borderColor="editorBorderSubtle" />

      {/* Color Management */}
      {activeSet && (
        <Box px={4} py={3}>
          <HStack mb={2}>
            <SectionLabel textStyle="fieldLabel">Terrain Colors</SectionLabel>
            <Spacer />
            <GhostIconButton
              aria-label="Add Color"
              icon={<AddIcon />}
              onClick={() => handleAddColor(activeSetIndex!)}
            />
          </HStack>

          <VStack align="stretch" spacing={2}>
            {activeSet.colors.map((color) => (
              <Box
                key={color.id}
                bg="gray.950"
                px={2}
                py={1}
                rounded="md"
                border="1px"
                borderColor="editorBorderSubtle"
              >
                <HStack spacing={2}>
                  <Input
                    type="color"
                    value={color.color}
                    size="xs"
                    w="6"
                    h="5"
                    p={0}
                    border="none"
                    onChange={(e) => {
                      const nextSets = [...wangSets];
                      nextSets[activeSetIndex!].colors = nextSets[activeSetIndex!].colors.map(
                        (c) => (c.id === color.id ? { ...c, color: e.target.value } : c),
                      );
                      updateTileset(tileset.id, { wangSets: nextSets });
                    }}
                  />
                  <Input
                    size="xs"
                    variant="unstyled"
                    value={color.name}
                    fontSize="10px"
                    fontWeight="bold"
                    onChange={(e) => {
                      const nextSets = [...wangSets];
                      nextSets[activeSetIndex!].colors = nextSets[activeSetIndex!].colors.map(
                        (c) => (c.id === color.id ? { ...c, name: e.target.value } : c),
                      );
                      updateTileset(tileset.id, { wangSets: nextSets });
                    }}
                  />
                  <Spacer />
                  <Circle
                    size="14px"
                    bg={color.color}
                    cursor="pointer"
                    boxShadow="0 0 5px rgba(0,0,0,0.5)"
                  />
                </HStack>
              </Box>
            ))}
          </VStack>

          <Box mt={4} p={3} bg="blue.900" rounded="md" border="1px" borderColor="blue.800">
            <VStack spacing={1} align="start">
              <Text fontSize="9px" fontWeight="black" color="blue.200">
                ℹ️ AUTOTILE HELP
              </Text>
              <Text fontSize="9px" color="blue.100" lineHeight="tight">
                Click a color dot, then paint corners on the tileset to train the autotiler.
              </Text>
            </VStack>
          </Box>
        </Box>
      )}
    </VStack>
  );
};
