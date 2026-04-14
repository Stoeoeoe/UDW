import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Badge,
  Box,
  Button,
  Circle,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Switch,
  Text,
  useDisclosure,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { BsTree, BsBuilding, BsWater, BsLayersHalf, BsStack } from 'react-icons/bs';
import { useEditorStore } from '../../../store/useEditorStore';
import { LayerType, PropertyDefinition, PropertyType, PropertyValue } from '../../../types/schema';
import {
  DialogListItem,
  DialogListWorkspace,
  EntityFormDialog,
  TopTabbedEditorLayout,
} from '../common';
import { EditorModal } from '../../common/EditorModal';

type MapSettingsTab = 'terrain' | 'metadata' | 'layers' | 'locations';

interface MapSettingsEditorProps {
  initialTab?: MapSettingsTab;
}

type MetadataDraft = {
  key: string;
  label: string;
  type: PropertyType;
  description: string;
  required: boolean;
  enumOptions: string[];
  defaultString: string;
  defaultNumber: number;
  defaultBoolean: boolean;
};

const METADATA_TYPES: PropertyType[] = ['string', 'int', 'float', 'boolean', 'enum'];

const layerIconComponents: Record<string, React.FC<{ size?: number }>> = {
  tree: BsTree,
  building: BsBuilding,
  water: BsWater,
  ground: BsLayersHalf,
  overlay: BsStack,
};

const LayerIcon: React.FC<{ icon?: string; color: string; size?: number }> = ({
  icon,
  color,
  size = 12,
}) => {
  if (!icon || !layerIconComponents[icon]) {
    return <Circle size={`${size}px`} bg={color} />;
  }

  const IconComponent = layerIconComponents[icon];
  return (
    <Box color={color}>
      <IconComponent size={size} />
    </Box>
  );
};

const toDefaultValue = (draft: MetadataDraft): PropertyValue => {
  if (draft.type === 'boolean') return draft.defaultBoolean;
  if (draft.type === 'int') return Math.round(draft.defaultNumber);
  if (draft.type === 'float' || draft.type === 'number') return draft.defaultNumber;
  return draft.defaultString;
};

const metadataDraftFromDefinition = (definition: PropertyDefinition): MetadataDraft => {
  const defaultString =
    definition.type === 'string' || definition.type === 'enum'
      ? String(definition.defaultValue ?? '')
      : '';
  const defaultNumber =
    definition.type === 'int' || definition.type === 'float' || definition.type === 'number'
      ? Number(definition.defaultValue ?? 0)
      : 0;
  const defaultBoolean = definition.type === 'boolean' ? Boolean(definition.defaultValue) : false;

  return {
    key: definition.key,
    label: definition.label,
    type: definition.type,
    description: definition.description || '',
    required: definition.required,
    enumOptions: definition.constraints?.options || [],
    defaultString,
    defaultNumber,
    defaultBoolean,
  };
};

const emptyMetadataDraft = (): MetadataDraft => ({
  key: `metadata_${Date.now()}`,
  label: 'New Metadata',
  type: 'string',
  description: '',
  required: false,
  enumOptions: [],
  defaultString: '',
  defaultNumber: 0,
  defaultBoolean: false,
});

const normalizeMetadataKey = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// TerrainDialog
// ─────────────────────────────────────────────────────────────────────────────

const TerrainDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
}> = ({ isOpen, onClose, editingId }) => {
  const terrainTypes = useEditorStore((s) => s.terrainTypes);
  const addTerrainType = useEditorStore((s) => s.addTerrainType);
  const updateTerrainType = useEditorStore((s) => s.updateTerrainType);
  const deleteTerrainType = useEditorStore((s) => s.deleteTerrainType);
  const toast = useToast();

  const existing = terrainTypes.find((t) => t.id === editingId);
  const form = useForm({
    defaultValues: existing
      ? { id: existing.id, displayName: existing.displayName, color: existing.color }
      : { id: `terrain_${Date.now()}`, displayName: 'New Terrain', color: '#3182ce' },
    onSubmit: async ({ value }) => {
      const nextId = value.id.trim();
      const nextName = value.displayName.trim();
      if (!nextId || !nextName) return;

      if (terrainTypes.some((t) => t.id === nextId) && (!editingId || editingId !== nextId)) {
        toast({ title: 'Terrain ID already exists', status: 'warning', duration: 1500 });
        return;
      }

      if (!editingId) {
        await addTerrainType({ id: nextId, displayName: nextName, color: value.color });
        toast({ title: 'Terrain created', status: 'success', duration: 1200 });
      } else if (editingId !== nextId) {
        await deleteTerrainType(editingId);
        await addTerrainType({ id: nextId, displayName: nextName, color: value.color });
        toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
      } else {
        await updateTerrainType(editingId, { displayName: nextName, color: value.color });
        toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
      }
      onClose();
    },
  });

  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="sm">
      <form.Subscribe selector={(s) => !s.canSubmit}>
        {(isDisabled) => (
          <EntityFormDialog
            title={editingId ? 'Edit Terrain' : 'Create Terrain'}
            onCancel={onClose}
            onSubmit={() => void form.handleSubmit()}
            submitLabel={editingId ? 'Save Terrain' : 'Create Terrain'}
            isSubmitDisabled={isDisabled}
            minWidth="420px"
          >
            <form.Field name="id">
              {(field) => (
                <FormControl>
                  <FormLabel>ID</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="displayName">
              {(field) => (
                <FormControl>
                  <FormLabel>Display Name</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="color">
              {(field) => (
                <FormControl>
                  <FormLabel>Color</FormLabel>
                  <Input
                    type="color"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    h="9"
                    p={0}
                  />
                </FormControl>
              )}
            </form.Field>
          </EntityFormDialog>
        )}
      </form.Subscribe>
    </EditorModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LayerDefinitionDialog
// ─────────────────────────────────────────────────────────────────────────────

const LAYER_TYPE_OPTIONS: { value: LayerType; label: string }[] = [
  { value: 'terrain', label: 'Terrain' },
  { value: 'tile', label: 'Tile' },
  { value: 'entity', label: 'Entity' },
];

const AVAILABLE_ICONS = [
  { value: '', label: 'None' },
  { value: 'tree', label: 'Tree' },
  { value: 'building', label: 'Building' },
  { value: 'water', label: 'Water' },
  { value: 'ground', label: 'Ground' },
  { value: 'overlay', label: 'Overlay' },
];

const LayerDefinitionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  nextZIndex: number;
}> = ({ isOpen, onClose, editingId, nextZIndex }) => {
  const layerDefinitions = useEditorStore((s) => s.layerDefinitions);
  const addLayerDefinition = useEditorStore((s) => s.addLayerDefinition);
  const updateLayerDefinition = useEditorStore((s) => s.updateLayerDefinition);
  const deleteLayerDefinition = useEditorStore((s) => s.deleteLayerDefinition);
  const toast = useToast();

  const existing = layerDefinitions.find((l) => l.id === editingId);
  const form = useForm({
    defaultValues: existing
      ? {
          id: existing.id,
          name: existing.name,
          type: existing.type as LayerType,
          zIndex: existing.zIndex,
          color: existing.color,
          icon: existing.icon || '',
          description: existing.description || '',
        }
      : {
          id: `layer_${Date.now()}`,
          name: 'New Layer',
          type: 'tile' as LayerType,
          zIndex: nextZIndex,
          color: '#3182ce',
          icon: '',
          description: '',
        },
    onSubmit: async ({ value }) => {
      const nextId = value.id.trim();
      const nextName = value.name.trim();
      if (!nextId || !nextName) return;

      if (layerDefinitions.some((l) => l.id === nextId) && (!editingId || editingId !== nextId)) {
        toast({ title: 'Layer ID already exists', status: 'warning', duration: 1500 });
        return;
      }

      const payload = {
        name: nextName,
        type: value.type,
        zIndex: value.zIndex,
        color: value.color,
        icon: value.icon || undefined,
        description: value.description.trim() || undefined,
      };

      if (!editingId) {
        await addLayerDefinition({ id: nextId, ...payload });
        toast({ title: 'Layer definition created', status: 'success', duration: 1200 });
      } else if (editingId !== nextId) {
        await deleteLayerDefinition(editingId);
        await addLayerDefinition({ id: nextId, ...payload });
        toast({ title: 'Layer definition updated', status: 'success', duration: 1200 });
      } else {
        await updateLayerDefinition(editingId, payload);
        toast({ title: 'Layer definition updated', status: 'success', duration: 1200 });
      }
      onClose();
    },
  });

  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="sm">
      <form.Subscribe selector={(s) => !s.canSubmit}>
        {(isDisabled) => (
          <EntityFormDialog
            title={editingId ? 'Edit Layer Definition' : 'Create Layer Definition'}
            onCancel={onClose}
            onSubmit={() => void form.handleSubmit()}
            submitLabel={editingId ? 'Save Layer' : 'Create Layer'}
            isSubmitDisabled={isDisabled}
            minWidth="460px"
          >
            <form.Field name="id">
              {(field) => (
                <FormControl>
                  <FormLabel>ID</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="name">
              {(field) => (
                <FormControl>
                  <FormLabel>Name</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormControl>
              )}
            </form.Field>
            <HStack spacing={3} align="start">
              <form.Field name="type">
                {(field) => (
                  <FormControl>
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value as LayerType)}
                      onBlur={field.handleBlur}
                    >
                      {LAYER_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </form.Field>
              <form.Field name="icon">
                {(field) => (
                  <FormControl>
                    <FormLabel>Icon</FormLabel>
                    <Select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    >
                      {AVAILABLE_ICONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </form.Field>
            </HStack>
            <HStack spacing={3} align="start">
              <form.Field name="zIndex">
                {(field) => (
                  <FormControl>
                    <FormLabel>Z-Index</FormLabel>
                    <NumberInput
                      value={field.state.value}
                      onChange={(_, v) => field.handleChange(Number.isNaN(v) ? 0 : Math.round(v))}
                    >
                      <NumberInputField onBlur={field.handleBlur} />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                )}
              </form.Field>
              <form.Field name="color">
                {(field) => (
                  <FormControl>
                    <FormLabel>Color</FormLabel>
                    <Input
                      type="color"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      h="9"
                      p={0}
                    />
                  </FormControl>
                )}
              </form.Field>
            </HStack>
            <form.Field name="description">
              {(field) => (
                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Optional"
                  />
                </FormControl>
              )}
            </form.Field>
          </EntityFormDialog>
        )}
      </form.Subscribe>
    </EditorModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MetadataDefinitionDialog
// ─────────────────────────────────────────────────────────────────────────────

const MetadataDefinitionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  editingKey: string | null;
  kind: 'tile' | 'location';
}> = ({ isOpen, onClose, editingKey, kind }) => {
  const tileMetadataDefinitions = useEditorStore((s) => s.tileMetadataDefinitions);
  const setTileMetadataDefinitions = useEditorStore((s) => s.setTileMetadataDefinitions);
  const locationMetadataDefinitions = useEditorStore((s) => s.locationMetadataDefinitions);
  const setLocationMetadataDefinitions = useEditorStore((s) => s.setLocationMetadataDefinitions);
  const toast = useToast();

  const definitions = kind === 'tile' ? tileMetadataDefinitions : locationMetadataDefinitions;
  const setDefinitions =
    kind === 'tile' ? setTileMetadataDefinitions : setLocationMetadataDefinitions;

  const existing = definitions.find((d) => d.key === editingKey);
  const form = useForm({
    defaultValues: existing ? metadataDraftFromDefinition(existing) : emptyMetadataDraft(),
    onSubmit: async ({ value }) => {
      const key = normalizeMetadataKey(value.key.trim());
      const label = value.label.trim();
      if (!key || !label) return;

      if (definitions.some((d) => d.key === key) && (!editingKey || editingKey !== key)) {
        toast({ title: 'Metadata key already exists', status: 'warning', duration: 1500 });
        return;
      }

      if (value.type === 'enum' && value.enumOptions.length === 0) {
        toast({ title: 'Enum metadata requires options', status: 'warning', duration: 1500 });
        return;
      }

      const nextDefinition: PropertyDefinition = {
        key,
        label,
        type: value.type,
        required: value.required,
        description: value.description.trim() || undefined,
        defaultValue: toDefaultValue(value),
        constraints: value.type === 'enum' ? { options: value.enumOptions } : undefined,
      };

      if (!editingKey) {
        await setDefinitions([...definitions, nextDefinition]);
        toast({ title: 'Metadata field created', status: 'success', duration: 1200 });
      } else {
        await setDefinitions(
          definitions.map((d) =>
            d.key === editingKey ? { ...nextDefinition, key: editingKey } : d,
          ),
        );
        toast({ title: 'Metadata field updated', status: 'success', duration: 1200 });
      }
      onClose();
    },
  });

  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="sm">
      <form.Subscribe selector={(s) => !s.canSubmit}>
        {(isDisabled) => (
          <EntityFormDialog
            title={editingKey ? 'Edit Metadata Field' : 'Create Metadata Field'}
            onCancel={onClose}
            onSubmit={() => void form.handleSubmit()}
            submitLabel={editingKey ? 'Save Metadata' : 'Create Metadata'}
            isSubmitDisabled={isDisabled}
            minWidth="520px"
            scrollable
          >
            <form.Field name="key">
              {(field) => (
                <FormControl>
                  <FormLabel>Key</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(normalizeMetadataKey(e.target.value))}
                    onBlur={field.handleBlur}
                    isReadOnly={Boolean(editingKey)}
                  />
                  {editingKey && (
                    <Text mt={1} fontSize="xs" color="gray.600">
                      Keys are locked after creation to avoid breaking existing tile assignments.
                    </Text>
                  )}
                </FormControl>
              )}
            </form.Field>

            <form.Field name="label">
              {(field) => (
                <FormControl>
                  <FormLabel>Label</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FormControl>
              )}
            </form.Field>

            <HStack spacing={3} align="start">
              <form.Field name="type">
                {(field) => (
                  <FormControl>
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={field.state.value}
                      onChange={(e) => {
                        const nextType = e.target.value as PropertyType;
                        field.handleChange(nextType);
                        if (nextType !== 'string' && nextType !== 'enum')
                          form.setFieldValue('defaultString', '');
                        if (!['int', 'float', 'number'].includes(nextType))
                          form.setFieldValue('defaultNumber', 0);
                        if (nextType !== 'boolean') form.setFieldValue('defaultBoolean', false);
                        if (nextType !== 'enum') form.setFieldValue('enumOptions', []);
                      }}
                      onBlur={field.handleBlur}
                    >
                      {METADATA_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </form.Field>
              <form.Field name="required">
                {(field) => (
                  <FormControl>
                    <FormLabel>Required</FormLabel>
                    <Switch
                      size="sm"
                      isChecked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                  </FormControl>
                )}
              </form.Field>
            </HStack>

            <form.Subscribe
              selector={(s) => ({ type: s.values.type, enumOptions: s.values.enumOptions })}
            >
              {({ type, enumOptions }) =>
                type === 'enum' ? (
                  <FormControl>
                    <FormLabel>Enum Options</FormLabel>
                    <VStack spacing={1} align="stretch">
                      {enumOptions.map((opt, idx) => (
                        <HStack key={idx} spacing={1}>
                          <Input
                            value={opt}
                            onChange={(e) => {
                              const next = [...enumOptions];
                              next[idx] = e.target.value;
                              form.setFieldValue('enumOptions', next);
                            }}
                          />
                          <IconButton
                            aria-label="Remove option"
                            icon={<DeleteIcon fontSize="8px" />}
                            size="sm"
                            variant="ghost"
                            color="gray.600"
                            _hover={{ color: 'red.300' }}
                            onClick={() =>
                              form.setFieldValue(
                                'enumOptions',
                                enumOptions.filter((_, i) => i !== idx),
                              )
                            }
                          />
                        </HStack>
                      ))}
                      <Button
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        leftIcon={<AddIcon fontSize="8px" />}
                        onClick={() => form.setFieldValue('enumOptions', [...enumOptions, ''])}
                      >
                        Add Option
                      </Button>
                    </VStack>
                  </FormControl>
                ) : null
              }
            </form.Subscribe>

            <form.Subscribe selector={(s) => s.values.type}>
              {(type) => (
                <>
                  {(type === 'string' || type === 'enum') && (
                    <form.Field name="defaultString">
                      {(field) => (
                        <FormControl>
                          <FormLabel>Default Value</FormLabel>
                          <Input
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                          />
                        </FormControl>
                      )}
                    </form.Field>
                  )}
                  {(type === 'int' || type === 'float' || type === 'number') && (
                    <form.Field name="defaultNumber">
                      {(field) => (
                        <FormControl>
                          <FormLabel>Default Value</FormLabel>
                          <NumberInput
                            value={field.state.value}
                            onChange={(_, v) => field.handleChange(Number.isNaN(v) ? 0 : v)}
                          >
                            <NumberInputField onBlur={field.handleBlur} />
                            <NumberInputStepper>
                              <NumberIncrementStepper />
                              <NumberDecrementStepper />
                            </NumberInputStepper>
                          </NumberInput>
                        </FormControl>
                      )}
                    </form.Field>
                  )}
                  {type === 'boolean' && (
                    <form.Field name="defaultBoolean">
                      {(field) => (
                        <FormControl>
                          <FormLabel>Default Value</FormLabel>
                          <Switch
                            isChecked={field.state.value}
                            onChange={(e) => field.handleChange(e.target.checked)}
                          />
                        </FormControl>
                      )}
                    </form.Field>
                  )}
                </>
              )}
            </form.Subscribe>

            <form.Field name="description">
              {(field) => (
                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Optional"
                  />
                </FormControl>
              )}
            </form.Field>
          </EntityFormDialog>
        )}
      </form.Subscribe>
    </EditorModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MapSettingsEditor (main)
// ─────────────────────────────────────────────────────────────────────────────

export const MapSettingsEditor: React.FC<MapSettingsEditorProps> = ({ initialTab = 'terrain' }) => {
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const deleteTerrainType = useEditorStore((state) => state.deleteTerrainType);

  const layerDefinitions = useEditorStore((state) => state.layerDefinitions);
  const deleteLayerDefinition = useEditorStore((state) => state.deleteLayerDefinition);

  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const setTileMetadataDefinitions = useEditorStore((state) => state.setTileMetadataDefinitions);
  const locationMetadataDefinitions = useEditorStore((state) => state.locationMetadataDefinitions);
  const setLocationMetadataDefinitions = useEditorStore(
    (state) => state.setLocationMetadataDefinitions,
  );

  const [activeTab, setActiveTab] = useState<MapSettingsTab>(initialTab);
  const toast = useToast();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const terrainDialog = useDisclosure();
  const [editingTerrainId, setEditingTerrainId] = useState<string | null>(null);

  const layerDialog = useDisclosure();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);

  const metadataDialog = useDisclosure();
  const [editingMetadataKey, setEditingMetadataKey] = useState<string | null>(null);
  const [metadataKind, setMetadataKind] = useState<'tile' | 'location'>('tile');

  const sortedLayers = useMemo(
    () => [...layerDefinitions].sort((a, b) => a.zIndex - b.zIndex),
    [layerDefinitions],
  );

  const terrainItems: DialogListItem[] = terrainTypes.map((terrain) => ({
    id: terrain.id,
    title: terrain.displayName,
    subtitle: terrain.id,
    icon: <Circle size="10px" bg={terrain.color} mt="6px" />,
    badge: (
      <Text fontSize="10px" color="gray.500" fontFamily="mono">
        {terrain.color}
      </Text>
    ),
  }));

  const layerItems: DialogListItem[] = sortedLayers.map((layer) => ({
    id: layer.id,
    title: layer.name,
    subtitle: layer.id,
    icon: <LayerIcon icon={layer.icon} color={layer.color} size={14} />,
    badge: (
      <Badge fontSize="9px" colorScheme="blue" variant="subtle">
        {layer.type}
      </Badge>
    ),
    meta: (
      <Text fontSize="10px" color="gray.500" fontFamily="mono">
        z-index: {layer.zIndex}
      </Text>
    ),
  }));

  const metadataItems: DialogListItem[] = tileMetadataDefinitions.map((definition) => ({
    id: definition.key,
    title: definition.label,
    subtitle: definition.key,
    badge: (
      <Badge fontSize="9px" colorScheme="purple" variant="subtle">
        {definition.type}
      </Badge>
    ),
    meta: (
      <HStack spacing={2}>
        {definition.required && (
          <Badge fontSize="9px" colorScheme="red" variant="subtle">
            required
          </Badge>
        )}
        <Text fontSize="10px" color="gray.500" fontFamily="mono">
          default: {String(definition.defaultValue ?? '')}
        </Text>
      </HStack>
    ),
  }));

  const locationItems: DialogListItem[] = locationMetadataDefinitions.map((definition) => ({
    id: definition.key,
    title: definition.label,
    subtitle: definition.key,
    badge: (
      <Badge fontSize="9px" colorScheme="purple" variant="subtle">
        {definition.type}
      </Badge>
    ),
    meta: (
      <HStack spacing={2}>
        {definition.required && (
          <Badge fontSize="9px" colorScheme="red" variant="subtle">
            required
          </Badge>
        )}
        <Text fontSize="10px" color="gray.500" fontFamily="mono">
          default: {String(definition.defaultValue ?? '')}
        </Text>
      </HStack>
    ),
  }));

  const deleteTerrain = async (id: string) => {
    const terrain = terrainTypes.find((entry) => entry.id === id);
    if (!terrain) return;
    if (!confirm(`Delete terrain "${terrain.displayName}"?`)) return;
    await deleteTerrainType(id);
    toast({ title: 'Terrain deleted', status: 'info', duration: 1200 });
  };

  const deleteLayer = async (id: string) => {
    const layer = layerDefinitions.find((entry) => entry.id === id);
    if (!layer) return;
    if (!confirm(`Delete layer definition "${layer.name}"?`)) return;
    await deleteLayerDefinition(id);
    toast({ title: 'Layer definition deleted', status: 'info', duration: 1200 });
  };

  const deleteMetadata = async (key: string) => {
    const definition =
      tileMetadataDefinitions.find((entry) => entry.key === key) ||
      locationMetadataDefinitions.find((entry) => entry.key === key);
    if (!definition) return;
    if (!confirm(`Delete metadata field "${definition.label}"?`)) return;

    if (tileMetadataDefinitions.some((d) => d.key === key)) {
      await setTileMetadataDefinitions(
        tileMetadataDefinitions.filter((entry) => entry.key !== key),
      );
    } else {
      await setLocationMetadataDefinitions(
        locationMetadataDefinitions.filter((entry) => entry.key !== key),
      );
    }
    toast({ title: 'Metadata field deleted', status: 'info', duration: 1200 });
  };

  const mainContent =
    activeTab === 'terrain' ? (
      <DialogListWorkspace
        title="Terrain Types"
        description="Used by tileset terrain painting and autotile generation."
        items={terrainItems}
        addLabel="Add Terrain"
        onAdd={() => {
          setEditingTerrainId(null);
          terrainDialog.onOpen();
        }}
        onOpenItem={(id) => {
          setEditingTerrainId(id);
          terrainDialog.onOpen();
        }}
        onDeleteItem={(id) => {
          void deleteTerrain(id);
        }}
        emptyIcon="🟦"
        emptyTitle="No terrain types"
        emptyDescription="Create terrain definitions to enable terrain painting and transitions."
      />
    ) : activeTab === 'metadata' ? (
      <DialogListWorkspace
        title="Tile Metadata Fields"
        description="Project-level metadata schema for tile properties."
        items={metadataItems}
        addLabel="Add Metadata Field"
        onAdd={() => {
          setEditingMetadataKey(null);
          setMetadataKind('tile');
          metadataDialog.onOpen();
        }}
        onOpenItem={(id) => {
          setEditingMetadataKey(id);
          setMetadataKind('tile');
          metadataDialog.onOpen();
        }}
        onDeleteItem={(id) => {
          void deleteMetadata(id);
        }}
        emptyIcon="🏷️"
        emptyTitle="No metadata fields"
        emptyDescription="Define metadata schema fields that can be assigned per tile."
      />
    ) : activeTab === 'locations' ? (
      <DialogListWorkspace
        title="Location Metadata Fields"
        description="Project-level metadata schema for maps/locations."
        items={locationItems}
        addLabel="Add Location Metadata"
        onAdd={() => {
          setEditingMetadataKey(null);
          setMetadataKind('location');
          metadataDialog.onOpen();
        }}
        onOpenItem={(id) => {
          setEditingMetadataKey(id);
          setMetadataKind('location');
          metadataDialog.onOpen();
        }}
        onDeleteItem={(id) => {
          void deleteMetadata(id);
        }}
        emptyIcon="📍"
        emptyTitle="No location metadata"
        emptyDescription="Define map/location metadata fields (e.g., music, indoors/outdoors)."
      />
    ) : (
      <DialogListWorkspace
        title="Layer Definitions"
        description="Template layers automatically used by maps in this project."
        items={layerItems}
        addLabel="Add Layer"
        onAdd={() => {
          setEditingLayerId(null);
          layerDialog.onOpen();
        }}
        onOpenItem={(id) => {
          setEditingLayerId(id);
          layerDialog.onOpen();
        }}
        onDeleteItem={(id) => {
          void deleteLayer(id);
        }}
        emptyIcon="🧱"
        emptyTitle="No layer definitions"
        emptyDescription="Create layer templates that determine map layer structure."
      />
    );

  const nextLayerZIndex =
    sortedLayers.length > 0 ? sortedLayers[sortedLayers.length - 1].zIndex + 1 : 0;

  return (
    <>
      <TopTabbedEditorLayout
        title="Map Config"
        tabs={[
          { id: 'terrain', label: 'Terrain', badge: terrainTypes.length },
          { id: 'metadata', label: 'Tile Metadata', badge: tileMetadataDefinitions.length },
          { id: 'layers', label: 'Layers', badge: layerDefinitions.length },
          {
            id: 'locations',
            label: 'Location Metadata',
            badge: locationMetadataDefinitions.length,
          },
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        mainContent={mainContent}
      />

      <TerrainDialog
        key={editingTerrainId ?? 'new-terrain'}
        isOpen={terrainDialog.isOpen}
        onClose={terrainDialog.onClose}
        editingId={editingTerrainId}
      />

      <LayerDefinitionDialog
        key={editingLayerId ?? 'new-layer'}
        isOpen={layerDialog.isOpen}
        onClose={layerDialog.onClose}
        editingId={editingLayerId}
        nextZIndex={nextLayerZIndex}
      />

      <MetadataDefinitionDialog
        key={editingMetadataKey ?? `new-${metadataKind}`}
        isOpen={metadataDialog.isOpen}
        onClose={metadataDialog.onClose}
        editingKey={editingMetadataKey}
        kind={metadataKind}
      />
    </>
  );
};
