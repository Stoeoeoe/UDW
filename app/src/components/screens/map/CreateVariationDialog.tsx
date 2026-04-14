import React, { useState, useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Select,
  Button,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  useToast,
  Badge,
  Input,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Variation } from '../../../types/schema';
import { CreateItemDialog } from '../../common/CreateItemDialog';
// Helper to compute depth within the component
const getVariationDepth = (id: string, variations: Variation[]): number => {
  let depth = 0;
  let currentId: string | undefined = id;
  while (currentId) {
    const parent = variations.find((v) => v.id === currentId);
    currentId = parent?.parentId;
    depth++;
  }
  return depth;
};

const SEASON_OPTIONS = [
  { id: 'spring', label: 'Spring', icon: '🌸' },
  { id: 'summer', label: 'Summer', icon: '☀️' },
  { id: 'autumn', label: 'Autumn', icon: '🍂' },
  { id: 'winter', label: 'Winter', icon: '❄️' },
];

interface CreateVariationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  existingVariations: Variation[];
}

export const CreateVariationDialog: React.FC<CreateVariationDialogProps> = ({
  isOpen,
  onClose,
  existingVariations,
}) => {
  const addVariation = useEditorStore((state) => state.addVariation);
  const setActiveVariation = useEditorStore((state) => state.setActiveVariation);
  const toast = useToast();

  const [kind, setKind] = useState<'season' | 'generic'>('generic');
  const [seasonId, setSeasonId] = useState<string>('spring');
  const [parentId, setParentId] = useState<string>('');
  const [tilesetSuffix, setTilesetSuffix] = useState('');
  const [autoSuffix, setAutoSuffix] = useState(true);

  const existingSeasonIds = useMemo(
    () => new Set(existingVariations.filter((v) => v.kind === 'season').map((v) => v.id)),
    [existingVariations],
  );

  const existingIds = useMemo(() => existingVariations.map((v) => v.id), [existingVariations]);

  const availableSeasons = SEASON_OPTIONS.filter((s) => !existingSeasonIds.has(s.id));

  const availableParents = useMemo(() => {
    return existingVariations.filter((v) => {
      const depth = getVariationDepth(v.id, existingVariations);
      return depth < 3;
    });
  }, [existingVariations]);

  const computeDerivedId = (nameValue: string): string => {
    if (kind === 'season') {
      return seasonId;
    }
    return nameValue
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const computeDerivedSuffix = (derivedId: string): string => {
    return autoSuffix ? `_${derivedId}` : tilesetSuffix;
  };

  const resetForm = () => {
    setKind('generic');
    setSeasonId(availableSeasons[0]?.id || 'spring');
    setParentId('');
    setTilesetSuffix('');
    setAutoSuffix(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = (data: { id: string; name: string }) => {
    const variation: Variation = {
      id: data.id,
      kind,
      displayName:
        kind === 'season'
          ? SEASON_OPTIONS.find((s) => s.id === seasonId)?.label || seasonId
          : data.name,
      parentId: parentId || undefined,
      tilesetSuffix: computeDerivedSuffix(data.id) || undefined,
      layerOverrides: {},
      entityOverrides: [],
    };

    addVariation(variation);
    setActiveVariation(variation.id);
    toast({
      title: `Variation "${variation.displayName}" created`,
      status: 'success',
      duration: 2000,
    });

    handleClose();
  };

  const additionalFields = (
    <VStack spacing={4} align="stretch" mt={3}>
      <FormControl>
        <FormLabel>Variation Type</FormLabel>
        <HStack spacing={2}>
          <Button
            flex={1}
            size="sm"
            variant={kind === 'season' ? 'solid' : 'outline'}
            colorScheme={kind === 'season' ? 'blue' : 'gray'}
            onClick={() => {
              setKind('season');
              setAutoSuffix(true);
            }}
            isDisabled={availableSeasons.length === 0}
          >
            🌿 Season
          </Button>
          <Button
            flex={1}
            size="sm"
            variant={kind === 'generic' ? 'solid' : 'outline'}
            colorScheme={kind === 'generic' ? 'blue' : 'gray'}
            onClick={() => setKind('generic')}
          >
            🏷️ Custom
          </Button>
        </HStack>
        <FormHelperText fontSize="xs" color="gray.600">
          {kind === 'season'
            ? 'Seasons get dedicated toggle buttons and interact with time preview.'
            : 'Custom variations for events, quests, or any contextual state.'}
        </FormHelperText>
      </FormControl>

      {kind === 'season' && (
        <FormControl>
          <FormLabel>Select Season</FormLabel>
          {availableSeasons.length === 0 ? (
            <Text fontSize="sm" color="yellow.400">
              All four seasons are already defined.
            </Text>
          ) : (
            <HStack spacing={2}>
              {availableSeasons.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={seasonId === s.id ? 'solid' : 'outline'}
                  colorScheme={seasonId === s.id ? 'blue' : 'gray'}
                  onClick={() => setSeasonId(s.id)}
                >
                  {s.icon} {s.label}
                </Button>
              ))}
            </HStack>
          )}
        </FormControl>
      )}

      {kind === 'generic' && (
        <FormControl>
          <FormLabel>Inherits From</FormLabel>
          <Select
            size="sm"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            bg="gray.800"
            color="white"
          >
            <option value="">(Base Map)</option>
            {availableParents.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayName}
              </option>
            ))}
          </Select>
          <FormHelperText fontSize="xs" color="gray.500">
            Changes made in this variation will be applied ON TOP of the parent variation.
          </FormHelperText>
        </FormControl>
      )}

      <FormControl>
        <HStack justify="space-between" mb={2}>
          <FormLabel mb={0}>Graphics Suffix</FormLabel>
          <HStack>
            <Text fontSize="xs" color={autoSuffix ? 'blue.300' : 'gray.500'}>
              Auto
            </Text>
            <Switch
              size="sm"
              isChecked={autoSuffix}
              onChange={(e) => setAutoSuffix(e.target.checked)}
            />
          </HStack>
        </HStack>
        <Input
          size="sm"
          value={autoSuffix ? `_auto` : tilesetSuffix}
          onChange={(e) => setTilesetSuffix(e.target.value)}
          isDisabled={autoSuffix}
          fontFamily="mono"
          bg="gray.800"
          color="white"
          placeholder="_my_variation"
        />
        <FormHelperText fontSize="xs">
          If set, the editor will look for tilesets like{' '}
          <Badge>my_tileset{autoSuffix ? '_auto' : tilesetSuffix}.png</Badge>
        </FormHelperText>
      </FormControl>
    </VStack>
  );

  return (
    <CreateItemDialog
      isOpen={isOpen}
      title={kind === 'season' ? 'New Season' : 'New Variation'}
      itemType="Variation"
      existingIds={existingIds}
      onSubmit={handleCreate}
      onClose={handleClose}
      deriveId={computeDerivedId}
      additionalFields={additionalFields}
    />
  );
};
