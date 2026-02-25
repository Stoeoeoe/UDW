import React, { useState, useMemo } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Input,
    Select,
    Button,
    FormControl,
    FormLabel,
    FormHelperText,
    Switch,
    useToast,
    Heading,
    Badge,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Variation } from '../../../types/schema';
import { EditorModal } from '../../common/EditorModal';

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

/**
 * CreateVariationDialog - A modal for creating new map variations.
 * Supports:
 * - Seasonal variations (predefined: spring, summer, autumn, winter)
 * - Generic variations (user-defined, e.g., "festival", "post_disaster")
 * - Parent variation selection (inheritance)
 * - Optional tileset suffix for visual overrides
 */
export const CreateVariationDialog: React.FC<CreateVariationDialogProps> = ({
    isOpen,
    onClose,
    existingVariations,
}) => {
    const addVariation = useEditorStore(state => state.addVariation);
    const setActiveVariation = useEditorStore(state => state.setActiveVariation);
    const toast = useToast();

    // Form state
    const [kind, setKind] = useState<'season' | 'generic'>('generic');
    const [seasonId, setSeasonId] = useState<string>('spring');
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState<string>('');
    const [tilesetSuffix, setTilesetSuffix] = useState('');
    const [autoSuffix, setAutoSuffix] = useState(true);

    // Which seasons are already defined
    const existingSeasonIds = useMemo(
        () => new Set(existingVariations.filter(v => v.kind === 'season').map(v => v.id)),
        [existingVariations]
    );

    // Available seasons (not yet created)
    const availableSeasons = SEASON_OPTIONS.filter(s => !existingSeasonIds.has(s.id));

    // Available parent variations (for generic variations)
    const availableParents = useMemo(() => {
        return existingVariations.filter(v => {
            // Don't allow too deep nesting (max 3 levels from the discussion)
            const depth = getVariationDepth(v.id, existingVariations);
            return depth < 3;
        });
    }, [existingVariations]);

    // Derived ID
    const derivedId = kind === 'season'
        ? seasonId
        : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Derived suffix
    const derivedSuffix = autoSuffix
        ? `_${derivedId}`
        : tilesetSuffix;

    // Validation
    const idConflict = existingVariations.some(v => v.id === derivedId);
    const isValid = kind === 'season'
        ? !existingSeasonIds.has(seasonId)
        : (name.trim().length > 0 && !idConflict);

    const handleCreate = () => {
        if (!isValid) return;

        const variation: Variation = {
            id: derivedId,
            kind,
            displayName: kind === 'season'
                ? SEASON_OPTIONS.find(s => s.id === seasonId)?.label || seasonId
                : name.trim(),
            parentId: parentId || undefined,
            tilesetSuffix: derivedSuffix || undefined,
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

        // Reset form
        resetForm();
        onClose();
    };

    const resetForm = () => {
        setKind('generic');
        setSeasonId(availableSeasons[0]?.id || 'spring');
        setName('');
        setParentId('');
        setTilesetSuffix('');
        setAutoSuffix(true);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    return (
        <EditorModal isOpen={isOpen} onClose={handleClose}>
            <Box bg="gray.900" p={8} rounded="2xl" border="1px" borderColor="gray.800" boxShadow="2xl" w="lg">
                <VStack spacing={6} align="stretch">
                    {/* Header */}
                    <VStack align="start" spacing={1}>
                        <Heading size="md" color="white">Create Variation</Heading>
                        <Text color="gray.500" fontSize="sm">
                            Define a new contextual or seasonal override for this map.
                        </Text>
                    </VStack>

                    {/* Kind Selector */}
                    <FormControl>
                        <FormLabel>Variation Type</FormLabel>
                        <HStack spacing={2}>
                            <Button
                                flex={1}
                                size="sm"
                                variant={kind === 'season' ? 'solid' : 'outline'}
                                colorScheme={kind === 'season' ? 'blue' : 'gray'}
                                onClick={() => setKind('season')}
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

                    {/* Season Selector (only for season kind) */}
                    {kind === 'season' && (
                        <FormControl>
                            <FormLabel>Select Season</FormLabel>
                            {availableSeasons.length === 0 ? (
                                <Text fontSize="sm" color="yellow.400">
                                    All four seasons are already defined.
                                </Text>
                            ) : (
                                <HStack spacing={2}>
                                    {availableSeasons.map(s => (
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

                    {/* Name (only for generic kind) */}
                    {kind === 'generic' && (
                        <FormControl isRequired isInvalid={idConflict}>
                            <FormLabel>Variation Name</FormLabel>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Festival, Post-Disaster, Night Market"
                                bg="gray.950"
                                borderColor="gray.700"
                                _focus={{ borderColor: 'blue.500' }}
                            />
                            {derivedId && (
                                <FormHelperText fontSize="xs" color={idConflict ? 'red.400' : 'gray.600'}>
                                    ID: <Badge fontSize="10px" variant="subtle" colorScheme={idConflict ? 'red' : 'gray'}>{derivedId}</Badge>
                                    {idConflict && ' — already exists'}
                                </FormHelperText>
                            )}
                        </FormControl>
                    )}

                    {/* Parent Variation (inheritance) */}
                    {kind === 'generic' && (
                        <FormControl>
                            <FormLabel>Inherits From</FormLabel>
                            <Select
                                value={parentId}
                                onChange={(e) => setParentId(e.target.value)}
                                bg="gray.950"
                                borderColor="gray.700"
                                _focus={{ borderColor: 'blue.500' }}
                            >
                                <option value="">None (standalone)</option>
                                {availableParents.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.kind === 'season' ? '🌿 ' : '🏷️ '}{v.displayName}
                                        {v.parentId ? ` (child of ${existingVariations.find(p => p.id === v.parentId)?.displayName || v.parentId})` : ''}
                                    </option>
                                ))}
                            </Select>
                            <FormHelperText fontSize="xs" color="gray.600">
                                Child variations inherit all overrides from their parent. Non-overridden content falls through.
                            </FormHelperText>
                        </FormControl>
                    )}

                    {/* Tileset Suffix */}
                    <FormControl>
                        <HStack justify="space-between" mb={2}>
                            <FormLabel mb={0}>Tileset Suffix</FormLabel>
                            <HStack spacing={2}>
                                <Text fontSize="xs" color="gray.500">Auto</Text>
                                <Switch
                                    size="sm"
                                    isChecked={autoSuffix}
                                    onChange={(e) => setAutoSuffix(e.target.checked)}
                                    colorScheme="blue"
                                />
                            </HStack>
                        </HStack>
                        {autoSuffix ? (
                            <Box
                                bg="gray.950"
                                border="1px"
                                borderColor="gray.700"
                                rounded="md"
                                px={3}
                                py={2}
                            >
                                <Text fontSize="sm" color="gray.400" fontFamily="mono">
                                    {derivedSuffix || '(none)'}
                                </Text>
                            </Box>
                        ) : (
                            <Input
                                value={tilesetSuffix}
                                onChange={(e) => setTilesetSuffix(e.target.value)}
                                placeholder="_winter, _festival, etc."
                                bg="gray.950"
                                borderColor="gray.700"
                                _focus={{ borderColor: 'blue.500' }}
                                fontFamily="mono"
                            />
                        )}
                        <FormHelperText fontSize="xs" color="gray.600">
                            When active, the editor tries to load <Badge fontSize="9px" variant="subtle">base_tileset{derivedSuffix}</Badge>.
                            Falls back to the base tileset if not found.
                        </FormHelperText>
                    </FormControl>

                    {/* Preview */}
                    <Box bg="gray.800" rounded="lg" p={4} border="1px" borderColor="gray.700">
                        <Text fontSize="9px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500" mb={2}>
                            Preview
                        </Text>
                        <VStack align="start" spacing={1}>
                            <HStack>
                                <Text fontSize="xs" color="gray.500" w="60px">Type:</Text>
                                <Badge colorScheme={kind === 'season' ? 'green' : 'purple'} fontSize="10px">
                                    {kind === 'season' ? '🌿 Season' : '🏷️ Custom'}
                                </Badge>
                            </HStack>
                            <HStack>
                                <Text fontSize="xs" color="gray.500" w="60px">Name:</Text>
                                <Text fontSize="xs" color="white" fontWeight="bold">
                                    {kind === 'season'
                                        ? SEASON_OPTIONS.find(s => s.id === seasonId)?.label
                                        : (name || '—')}
                                </Text>
                            </HStack>
                            <HStack>
                                <Text fontSize="xs" color="gray.500" w="60px">ID:</Text>
                                <Text fontSize="xs" color="gray.300" fontFamily="mono">{derivedId || '—'}</Text>
                            </HStack>
                            {parentId && (
                                <HStack>
                                    <Text fontSize="xs" color="gray.500" w="60px">Parent:</Text>
                                    <Text fontSize="xs" color="gray.300">
                                        {existingVariations.find(v => v.id === parentId)?.displayName || parentId}
                                    </Text>
                                </HStack>
                            )}
                            <HStack>
                                <Text fontSize="xs" color="gray.500" w="60px">Suffix:</Text>
                                <Text fontSize="xs" color="gray.300" fontFamily="mono">{derivedSuffix || '(none)'}</Text>
                            </HStack>
                        </VStack>
                    </Box>

                    {/* Actions */}
                    <HStack justify="flex-end" spacing={3} pt={2}>
                        <Button size="sm" variant="ghost" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            colorScheme="blue"
                            onClick={handleCreate}
                            isDisabled={!isValid}
                        >
                            Create Variation
                        </Button>
                    </HStack>
                </VStack>
            </Box>
        </EditorModal>
    );
};

/**
 * Calculate the depth of a variation in its inheritance chain.
 * depth 0 = root (no parent), 1 = one level of nesting, etc.
 */
function getVariationDepth(variationId: string, allVariations: Variation[]): number {
    let depth = 0;
    let current = allVariations.find(v => v.id === variationId);
    while (current?.parentId) {
        depth++;
        current = allVariations.find(v => v.id === current!.parentId);
        if (depth > 10) break; // Safety against cycles
    }
    return depth;
}
