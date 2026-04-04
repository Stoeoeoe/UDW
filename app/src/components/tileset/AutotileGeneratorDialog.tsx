import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { EditorModal } from '../common/EditorModal';
import { Tileset } from '../../types/schema';
import { useEditorStore } from '../../store/useEditorStore';
import { fileSystem } from '../../lib/fileSystem';
import {
  AutoTilePreset,
  getAutoTilePatterns,
  generateAutotileTilesetAtlas,
} from '../../lib/autotileGenerator';

interface AutotileGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tileset: Tileset;
}

function sanitizeId(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'autotile-set';
}

function parseTileIndexList(raw: string): number[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const unique = new Set<number>();
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0) continue;
    unique.add(n);
  }

  return Array.from(unique.values()).sort((a, b) => a - b);
}

function formatTileIndexList(values: number[]): string {
  return values.join(', ');
}

const PatternSwatch: React.FC<{
  patternKey: string;
  corners: ['A' | 'B', 'A' | 'B', 'A' | 'B', 'A' | 'B'];
  aColor: string;
  bColor: string;
}> = ({ patternKey, corners, aColor, bColor }) => {
  const colorOf = (v: 'A' | 'B') => (v === 'A' ? aColor : bColor);

  return (
    <VStack
      spacing={1}
      align="stretch"
      border="1px"
      borderColor="gray.700"
      rounded="md"
      p={2}
      bg="gray.900"
    >
      <Grid templateColumns="1fr 1fr" templateRows="1fr 1fr" gap={1} h="50px">
        <GridItem bg={colorOf(corners[0])} rounded="sm" />
        <GridItem bg={colorOf(corners[1])} rounded="sm" />
        <GridItem bg={colorOf(corners[2])} rounded="sm" />
        <GridItem bg={colorOf(corners[3])} rounded="sm" />
      </Grid>
      <Text fontSize="10px" color="gray.400" noOfLines={1}>
        {patternKey}
      </Text>
    </VStack>
  );
};

export const AutotileGeneratorDialog: React.FC<AutotileGeneratorDialogProps> = ({
  isOpen,
  onClose,
  tileset,
}) => {
  const toast = useToast();
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const tilesets = useEditorStore((state) => state.tilesets);
  const addTileset = useEditorStore((state) => state.addTileset);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);

  const [preset, setPreset] = useState<AutoTilePreset>('simple');
  const [variantsPerPattern, setVariantsPerPattern] = useState(1);

  const [terrainAId, setTerrainAId] = useState<string>(terrainTypes[0]?.id || '');
  const [terrainBId, setTerrainBId] = useState<string>(
    terrainTypes[1]?.id || terrainTypes[0]?.id || '',
  );

  const [sourceAInput, setSourceAInput] = useState('');
  const [sourceBInput, setSourceBInput] = useState('');

  const [outputName, setOutputName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [outputNameTouched, setOutputNameTouched] = useState(false);
  const [outputIdTouched, setOutputIdTouched] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const patterns = useMemo(() => getAutoTilePatterns(preset), [preset]);

  const terrainA = terrainTypes.find((t) => t.id === terrainAId) || null;
  const terrainB = terrainTypes.find((t) => t.id === terrainBId) || null;

  const previewAColor = terrainA?.color || '#3182ce';
  const previewBColor = terrainB?.color || '#718096';

  React.useEffect(() => {
    if (!isOpen) return;
    setOutputNameTouched(false);
    setOutputIdTouched(false);
    setOutputName('');
    setOutputId('');

    const ta = terrainTypes[0]?.id || '';
    const tb = terrainTypes[1]?.id || terrainTypes[0]?.id || '';
    setTerrainAId((prev) => prev || ta);
    setTerrainBId((prev) => prev || tb);
  }, [isOpen, terrainTypes]);

  React.useEffect(() => {
    if (!isOpen) return;
    const aName = terrainTypes.find((t) => t.id === terrainAId)?.displayName || 'Terrain A';
    const bName = terrainTypes.find((t) => t.id === terrainBId)?.displayName || 'Terrain B';
    const suggestedName = `${aName} ${bName} Transitions`;
    const suggestedId = sanitizeId(`${tileset.id}-${terrainAId}-${terrainBId}-${preset}`);

    if (!outputNameTouched) setOutputName(suggestedName);
    if (!outputIdTouched) setOutputId(suggestedId);
  }, [
    isOpen,
    outputIdTouched,
    outputNameTouched,
    terrainAId,
    terrainBId,
    preset,
    terrainTypes,
    tileset.id,
  ]);

  const applyCurrentSelectionToA = () => {
    setSourceAInput(formatTileIndexList(selectedTileIndices));
  };

  const applyCurrentSelectionToB = () => {
    setSourceBInput(formatTileIndexList(selectedTileIndices));
  };

  const handleClose = () => {
    setIsGenerating(false);
    onClose();
  };

  const handleGenerate = async () => {
    if (terrainTypes.length < 2) {
      toast({
        title: 'Need at least two terrain types',
        description: 'Create terrain types first, then generate transitions.',
        status: 'warning',
      });
      return;
    }

    if (!terrainAId || !terrainBId) {
      toast({ title: 'Pick two terrains', status: 'warning' });
      return;
    }

    if (terrainAId === terrainBId) {
      toast({ title: 'Choose two different terrains', status: 'warning' });
      return;
    }

    const sourceA = parseTileIndexList(sourceAInput);
    const sourceB = parseTileIndexList(sourceBInput);

    if (!sourceA.length || !sourceB.length) {
      toast({
        title: 'Missing source samples',
        description: 'Provide at least one tile index for both terrain groups.',
        status: 'warning',
      });
      return;
    }

    const sprite = loadedSprites.get(tileset.spriteSheet);
    if (!sprite) {
      toast({
        title: 'Tileset sprite is not loaded',
        description: 'Re-open the tileset and try again.',
        status: 'error',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateAutotileTilesetAtlas({
        sprite,
        sourceColumns: tileset.columns,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        sourceAIndices: sourceA,
        sourceBIndices: sourceB,
        terrainAId,
        terrainBId,
        preset,
        variantsPerPattern,
        idPrefix: outputId,
      });

      const baseId = sanitizeId(outputId || `${tileset.id}-${terrainAId}-${terrainBId}-${preset}`);
      let finalId = baseId;
      let suffix = 2;
      while (tilesets.has(finalId)) {
        finalId = `${baseId}-${suffix}`;
        suffix++;
      }

      const filename = `${finalId}-${Date.now()}.png`;
      const spriteSheet = await fileSystem.saveAsset(filename, generated.pngBlob);

      await addTileset({
        version: 1,
        id: finalId,
        name:
          outputName ||
          `${terrainA?.displayName || terrainAId} / ${terrainB?.displayName || terrainBId}`,
        spriteSheet,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        columns: generated.columns,
        tileCount: generated.tileCount,
        tiles: generated.tiles,
        wangSets: [],
      });

      setActiveTileset(finalId);

      toast({
        title: 'Autotile set generated',
        description: `Created ${generated.tileCount} tiles (${patterns.length} patterns).`,
        status: 'success',
        duration: 3500,
      });

      handleClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Failed to generate autotiles',
        description: message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const hasEnoughTerrains = terrainTypes.length >= 2;
  const selectedIndicesLabel = selectedTileIndices.length ? selectedTileIndices.join(', ') : 'none';

  return (
    <EditorModal isOpen={isOpen} onClose={handleClose} size="2xl">
      <Box bg="gray.900" p={6} rounded="2xl" border="1px" borderColor="gray.800" boxShadow="2xl">
        <VStack align="stretch" spacing={4}>
          <VStack align="start" spacing={0}>
            <Text color="white" fontSize="lg" fontWeight="bold">
              Auto Tile Generator
            </Text>
            <Text color="gray.400" fontSize="sm">
              Build transition tiles from selected source tiles in this tileset.
            </Text>
          </VStack>

          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4}>
            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                Terrain A
              </FormLabel>
              <Select
                bg="gray.950"
                borderColor="gray.700"
                value={terrainAId}
                onChange={(e) => setTerrainAId(e.target.value)}
                isDisabled={!hasEnoughTerrains}
              >
                {terrainTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                Terrain B
              </FormLabel>
              <Select
                bg="gray.950"
                borderColor="gray.700"
                value={terrainBId}
                onChange={(e) => setTerrainBId(e.target.value)}
                isDisabled={!hasEnoughTerrains}
              >
                {terrainTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4}>
            <FormControl>
              <HStack justify="space-between" mb={1}>
                <FormLabel m={0} fontSize="xs" color="gray.400" textTransform="uppercase">
                  Source Tiles A
                </FormLabel>
                <Button size="xs" variant="outline" onClick={applyCurrentSelectionToA}>
                  Use Selection
                </Button>
              </HStack>
              <Input
                placeholder="e.g. 0, 1, 2"
                bg="gray.950"
                borderColor="gray.700"
                value={sourceAInput}
                onChange={(e) => setSourceAInput(e.target.value)}
              />
            </FormControl>

            <FormControl>
              <HStack justify="space-between" mb={1}>
                <FormLabel m={0} fontSize="xs" color="gray.400" textTransform="uppercase">
                  Source Tiles B
                </FormLabel>
                <Button size="xs" variant="outline" onClick={applyCurrentSelectionToB}>
                  Use Selection
                </Button>
              </HStack>
              <Input
                placeholder="e.g. 16, 17, 18"
                bg="gray.950"
                borderColor="gray.700"
                value={sourceBInput}
                onChange={(e) => setSourceBInput(e.target.value)}
              />
            </FormControl>
          </Grid>

          <Text fontSize="xs" color="gray.500">
            Current tile selection: {selectedIndicesLabel}
          </Text>

          <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={4}>
            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                Preset
              </FormLabel>
              <Select
                bg="gray.950"
                borderColor="gray.700"
                value={preset}
                onChange={(e) => {
                  const next = e.target.value as AutoTilePreset;
                  setPreset(next);
                  if (!outputIdTouched) {
                    setOutputId(sanitizeId(`${tileset.id}-${terrainAId}-${terrainBId}-${next}`));
                  }
                }}
              >
                <option value="simple">Simple (14, no checkerboards)</option>
                <option value="full">Full (16, complete Wang corners)</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                Variants Per Pattern
              </FormLabel>
              <NumberInput
                min={1}
                max={8}
                value={variantsPerPattern}
                onChange={(_, valueAsNumber) =>
                  setVariantsPerPattern(Number.isFinite(valueAsNumber) ? valueAsNumber : 1)
                }
              >
                <NumberInputField bg="gray.950" borderColor="gray.700" />
              </NumberInput>
            </FormControl>

            <VStack align="start" justify="center" spacing={0}>
              <Text fontSize="xs" color="gray.400" textTransform="uppercase">
                Output Count
              </Text>
              <Text color="white" fontWeight="bold">
                {patterns.length * Math.max(1, Math.floor(variantsPerPattern))} tiles
              </Text>
            </VStack>
          </Grid>

          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4}>
            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                New Tileset Name
              </FormLabel>
              <Input
                bg="gray.950"
                borderColor="gray.700"
                value={outputName}
                onChange={(e) => {
                  setOutputNameTouched(true);
                  setOutputName(e.target.value);
                }}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" color="gray.400" textTransform="uppercase">
                New Tileset ID
              </FormLabel>
              <Input
                bg="gray.950"
                borderColor="gray.700"
                value={outputId}
                onChange={(e) => {
                  setOutputIdTouched(true);
                  setOutputId(sanitizeId(e.target.value));
                }}
              />
            </FormControl>
          </Grid>

          <Divider borderColor="gray.800" />

          <VStack align="start" spacing={2}>
            <Text fontSize="xs" color="gray.400" textTransform="uppercase">
              Pattern Preview
            </Text>
            <Grid
              templateColumns="repeat(7, minmax(0, 1fr))"
              gap={2}
              w="full"
              maxH="220px"
              overflowY="auto"
            >
              {patterns.map((pattern) => (
                <PatternSwatch
                  key={pattern.key}
                  patternKey={pattern.key}
                  corners={pattern.corners}
                  aColor={previewAColor}
                  bColor={previewBColor}
                />
              ))}
            </Grid>
          </VStack>

          <HStack justify="flex-end" spacing={3}>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleGenerate}
              isLoading={isGenerating}
              isDisabled={!hasEnoughTerrains}
            >
              Generate
            </Button>
          </HStack>
        </VStack>
      </Box>
    </EditorModal>
  );
};

export default AutotileGeneratorDialog;
