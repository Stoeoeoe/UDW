import React, { useEffect, useMemo, useState } from 'react';
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

type TerrainDraft = {
  id: string;
  displayName: string;
  color: string;
};

type LayerDraft = {
  id: string;
  name: string;
  type: LayerType;
  zIndex: number;
  color: string;
  icon: string;
  description: string;
};

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

const EMPTY_TERRAIN: TerrainDraft = {
  id: '',
  displayName: '',
  color: '#3182ce',
};

const EMPTY_LAYER: LayerDraft = {
  id: '',
  name: '',
  type: 'tile',
  zIndex: 0,
  color: '#3182ce',
  icon: '',
  description: '',
};

const METADATA_TYPES: PropertyType[] = ['string', 'int', 'float', 'boolean', 'enum'];

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

export const MapSettingsEditor: React.FC<MapSettingsEditorProps> = ({ initialTab = 'terrain' }) => {
  const terrainTypes = useEditorStore((state) => state.terrainTypes);
  const addTerrainType = useEditorStore((state) => state.addTerrainType);
  const updateTerrainType = useEditorStore((state) => state.updateTerrainType);
  const deleteTerrainType = useEditorStore((state) => state.deleteTerrainType);

  const layerDefinitions = useEditorStore((state) => state.layerDefinitions);
  const addLayerDefinition = useEditorStore((state) => state.addLayerDefinition);
  const updateLayerDefinition = useEditorStore((state) => state.updateLayerDefinition);
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
  const [terrainDraft, setTerrainDraft] = useState<TerrainDraft>(EMPTY_TERRAIN);

  const layerDialog = useDisclosure();
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerDraft, setLayerDraft] = useState<LayerDraft>(EMPTY_LAYER);

  const metadataDialog = useDisclosure();
  const [editingMetadataKey, setEditingMetadataKey] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>(emptyMetadataDraft);

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

  const openCreateTerrain = () => {
    setEditingTerrainId(null);
    setTerrainDraft({
      ...EMPTY_TERRAIN,
      id: `terrain_${Date.now()}`,
      displayName: 'New Terrain',
    });
    terrainDialog.onOpen();
  };

  const openEditTerrain = (id: string) => {
    const terrain = terrainTypes.find((entry) => entry.id === id);
    if (!terrain) return;

    setEditingTerrainId(id);
    setTerrainDraft({ id: terrain.id, displayName: terrain.displayName, color: terrain.color });
    terrainDialog.onOpen();
  };

  const saveTerrain = async () => {
    const nextId = terrainDraft.id.trim();
    const nextName = terrainDraft.displayName.trim();
    if (!nextId || !nextName) return;

    if (
      terrainTypes.some((entry) => entry.id === nextId) &&
      (!editingTerrainId || editingTerrainId !== nextId)
    ) {
      toast({ title: 'Terrain ID already exists', status: 'warning', duration: 1500 });
      return;
    }

    if (!editingTerrainId) {
      await addTerrainType({ id: nextId, displayName: nextName, color: terrainDraft.color });
      toast({ title: 'Terrain created', status: 'success', duration: 1200 });
    } else if (editingTerrainId !== nextId) {
      await deleteTerrainType(editingTerrainId);
      await addTerrainType({ id: nextId, displayName: nextName, color: terrainDraft.color });
      toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
    } else {
      await updateTerrainType(editingTerrainId, {
        displayName: nextName,
        color: terrainDraft.color,
      });
      toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
    }

    terrainDialog.onClose();
  };

  const deleteTerrain = async (id: string) => {
    const terrain = terrainTypes.find((entry) => entry.id === id);
    if (!terrain) return;
    if (!confirm(`Delete terrain "${terrain.displayName}"?`)) return;
    await deleteTerrainType(id);
    toast({ title: 'Terrain deleted', status: 'info', duration: 1200 });
  };

  const openCreateLayer = () => {
    const nextZ = sortedLayers.length > 0 ? sortedLayers[sortedLayers.length - 1].zIndex + 1 : 0;
    setEditingLayerId(null);
    setLayerDraft({
      ...EMPTY_LAYER,
      id: `layer_${Date.now()}`,
      name: 'New Layer',
      zIndex: nextZ,
    });
    layerDialog.onOpen();
  };

  const openEditLayer = (id: string) => {
    const layer = layerDefinitions.find((entry) => entry.id === id);
    if (!layer) return;

    setEditingLayerId(id);
    setLayerDraft({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      zIndex: layer.zIndex,
      color: layer.color,
      icon: layer.icon || '',
      description: layer.description || '',
    });
    layerDialog.onOpen();
  };

  const saveLayer = async () => {
    const nextId = layerDraft.id.trim();
    const nextName = layerDraft.name.trim();
    if (!nextId || !nextName) return;

    if (
      layerDefinitions.some((entry) => entry.id === nextId) &&
      (!editingLayerId || editingLayerId !== nextId)
    ) {
      toast({ title: 'Layer ID already exists', status: 'warning', duration: 1500 });
      return;
    }

    const payload = {
      name: nextName,
      type: layerDraft.type,
      zIndex: layerDraft.zIndex,
      color: layerDraft.color,
      icon: layerDraft.icon || undefined,
      description: layerDraft.description.trim() || undefined,
    };

    if (!editingLayerId) {
      await addLayerDefinition({ id: nextId, ...payload });
      toast({ title: 'Layer definition created', status: 'success', duration: 1200 });
    } else if (editingLayerId !== nextId) {
      await deleteLayerDefinition(editingLayerId);
      await addLayerDefinition({ id: nextId, ...payload });
      toast({ title: 'Layer definition updated', status: 'success', duration: 1200 });
    } else {
      await updateLayerDefinition(editingLayerId, payload);
      toast({ title: 'Layer definition updated', status: 'success', duration: 1200 });
    }

    layerDialog.onClose();
  };

  const deleteLayer = async (id: string) => {
    const layer = layerDefinitions.find((entry) => entry.id === id);
    if (!layer) return;
    if (!confirm(`Delete layer definition "${layer.name}"?`)) return;
    await deleteLayerDefinition(id);
    toast({ title: 'Layer definition deleted', status: 'info', duration: 1200 });
  };

  const openCreateMetadata = () => {
    setEditingMetadataKey(null);
    setMetadataDraft(emptyMetadataDraft());
    metadataDialog.onOpen();
  };

  const openCreateLocation = () => {
    setEditingMetadataKey(null);
    setMetadataDraft(emptyMetadataDraft());
    metadataDialog.onOpen();
  };

  const openEditMetadata = (key: string) => {
    const definition = tileMetadataDefinitions.find((entry) => entry.key === key);
    if (!definition) return;

    setEditingMetadataKey(key);
    setMetadataDraft(metadataDraftFromDefinition(definition));
    metadataDialog.onOpen();
  };

  const openEditLocation = (key: string) => {
    const definition = locationMetadataDefinitions.find((entry) => entry.key === key);
    if (!definition) return;

    setEditingMetadataKey(key);
    setMetadataDraft(metadataDraftFromDefinition(definition));
    metadataDialog.onOpen();
  };

  const saveMetadata = async () => {
    const key = normalizeMetadataKey(metadataDraft.key.trim());
    const label = metadataDraft.label.trim();
    if (!key || !label) return;

    if (
      tileMetadataDefinitions.some((entry) => entry.key === key) &&
      (!editingMetadataKey || editingMetadataKey !== key)
    ) {
      toast({ title: 'Metadata key already exists', status: 'warning', duration: 1500 });
      return;
    }

    const options = metadataDraft.enumOptions;

    if (metadataDraft.type === 'enum' && options.length === 0) {
      toast({ title: 'Enum metadata requires options', status: 'warning', duration: 1500 });
      return;
    }

    const nextDefinition: PropertyDefinition = {
      key,
      label,
      type: metadataDraft.type,
      required: metadataDraft.required,
      description: metadataDraft.description.trim() || undefined,
      defaultValue: toDefaultValue(metadataDraft),
      constraints: metadataDraft.type === 'enum' ? { options } : undefined,
    };

    if (!editingMetadataKey) {
      if (activeTab === 'metadata') {
        await setTileMetadataDefinitions([...tileMetadataDefinitions, nextDefinition]);
      } else {
        await setLocationMetadataDefinitions([...locationMetadataDefinitions, nextDefinition]);
      }
      toast({ title: 'Metadata field created', status: 'success', duration: 1200 });
    } else {
      if (activeTab === 'metadata') {
        await setTileMetadataDefinitions(
          tileMetadataDefinitions.map((entry) =>
            entry.key === editingMetadataKey
              ? { ...nextDefinition, key: editingMetadataKey }
              : entry,
          ),
        );
      } else {
        await setLocationMetadataDefinitions(
          locationMetadataDefinitions.map((entry) =>
            entry.key === editingMetadataKey
              ? { ...nextDefinition, key: editingMetadataKey }
              : entry,
          ),
        );
      }
      toast({ title: 'Metadata field updated', status: 'success', duration: 1200 });
    }

    metadataDialog.onClose();
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
        onAdd={openCreateTerrain}
        onOpenItem={openEditTerrain}
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
        onAdd={openCreateMetadata}
        onOpenItem={openEditMetadata}
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
        onAdd={openCreateLocation}
        onOpenItem={openEditLocation}
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
        onAdd={openCreateLayer}
        onOpenItem={openEditLayer}
        onDeleteItem={(id) => {
          void deleteLayer(id);
        }}
        emptyIcon="🧱"
        emptyTitle="No layer definitions"
        emptyDescription="Create layer templates that determine map layer structure."
      />
    );

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

      <EditorModal isOpen={terrainDialog.isOpen} onClose={terrainDialog.onClose} size="sm">
        <EntityFormDialog
          title={editingTerrainId ? 'Edit Terrain' : 'Create Terrain'}
          onCancel={terrainDialog.onClose}
          onSubmit={() => {
            void saveTerrain();
          }}
          submitLabel={editingTerrainId ? 'Save Terrain' : 'Create Terrain'}
          isSubmitDisabled={!terrainDraft.id.trim() || !terrainDraft.displayName.trim()}
          minWidth="420px"
        >
          <FormControl>
            <FormLabel>ID</FormLabel>
            <Input
              value={terrainDraft.id}
              onChange={(e) => setTerrainDraft((p) => ({ ...p, id: e.target.value }))}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Display Name</FormLabel>
            <Input
              value={terrainDraft.displayName}
              onChange={(e) => setTerrainDraft((p) => ({ ...p, displayName: e.target.value }))}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Color</FormLabel>
            <Input
              type="color"
              value={terrainDraft.color}
              onChange={(e) => setTerrainDraft((p) => ({ ...p, color: e.target.value }))}
              h="9"
              p={0}
            />
          </FormControl>
        </EntityFormDialog>
      </EditorModal>

      <EditorModal isOpen={layerDialog.isOpen} onClose={layerDialog.onClose} size="sm">
        <EntityFormDialog
          title={editingLayerId ? 'Edit Layer Definition' : 'Create Layer Definition'}
          onCancel={layerDialog.onClose}
          onSubmit={() => {
            void saveLayer();
          }}
          submitLabel={editingLayerId ? 'Save Layer' : 'Create Layer'}
          isSubmitDisabled={!layerDraft.id.trim() || !layerDraft.name.trim()}
          minWidth="460px"
        >
          <FormControl>
            <FormLabel>ID</FormLabel>
            <Input
              value={layerDraft.id}
              onChange={(e) => setLayerDraft((p) => ({ ...p, id: e.target.value }))}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Name</FormLabel>
            <Input
              value={layerDraft.name}
              onChange={(e) => setLayerDraft((p) => ({ ...p, name: e.target.value }))}
            />
          </FormControl>
          <HStack spacing={3} align="start">
            <FormControl>
              <FormLabel>Type</FormLabel>
              <Select
                value={layerDraft.type}
                onChange={(e) =>
                  setLayerDraft((p) => ({ ...p, type: e.target.value as LayerType }))
                }
              >
                {LAYER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Icon</FormLabel>
              <Select
                value={layerDraft.icon}
                onChange={(e) => setLayerDraft((p) => ({ ...p, icon: e.target.value }))}
              >
                {AVAILABLE_ICONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormControl>
          </HStack>
          <HStack spacing={3} align="start">
            <FormControl>
              <FormLabel>Z-Index</FormLabel>
              <NumberInput
                value={layerDraft.zIndex}
                onChange={(_, v) =>
                  setLayerDraft((p) => ({ ...p, zIndex: Number.isNaN(v) ? 0 : Math.round(v) }))
                }
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>
            <FormControl>
              <FormLabel>Color</FormLabel>
              <Input
                type="color"
                value={layerDraft.color}
                onChange={(e) => setLayerDraft((p) => ({ ...p, color: e.target.value }))}
                h="9"
                p={0}
              />
            </FormControl>
          </HStack>
          <FormControl>
            <FormLabel>Description</FormLabel>
            <Input
              value={layerDraft.description}
              onChange={(e) => setLayerDraft((p) => ({ ...p, description: e.target.value }))}
              placeholder="Optional"
            />
          </FormControl>
        </EntityFormDialog>
      </EditorModal>

      <EditorModal isOpen={metadataDialog.isOpen} onClose={metadataDialog.onClose} size="sm">
        <EntityFormDialog
          title={editingMetadataKey ? 'Edit Metadata Field' : 'Create Metadata Field'}
          onCancel={metadataDialog.onClose}
          onSubmit={() => {
            void saveMetadata();
          }}
          submitLabel={editingMetadataKey ? 'Save Metadata' : 'Create Metadata'}
          isSubmitDisabled={
            !metadataDraft.label.trim() || !normalizeMetadataKey(metadataDraft.key.trim())
          }
          minWidth="520px"
        >
          <FormControl>
            <FormLabel>Key</FormLabel>
            <Input
              value={metadataDraft.key}
              onChange={(event) =>
                setMetadataDraft((prev) => ({
                  ...prev,
                  key: normalizeMetadataKey(event.target.value),
                }))
              }
              isReadOnly={Boolean(editingMetadataKey)}
            />
            {editingMetadataKey && (
              <Text mt={1} fontSize="xs" color="gray.600">
                Keys are locked after creation to avoid breaking existing tile assignments.
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel>Label</FormLabel>
            <Input
              value={metadataDraft.label}
              onChange={(event) =>
                setMetadataDraft((prev) => ({ ...prev, label: event.target.value }))
              }
            />
          </FormControl>

          <HStack spacing={3} align="start">
            <FormControl>
              <FormLabel>Type</FormLabel>
              <Select
                value={metadataDraft.type}
                onChange={(event) => {
                  const nextType = event.target.value as PropertyType;
                  setMetadataDraft((prev) => ({
                    ...prev,
                    type: nextType,
                    defaultString:
                      nextType === 'string' || nextType === 'enum' ? '' : prev.defaultString,
                    defaultNumber:
                      nextType === 'int' || nextType === 'float' || nextType === 'number'
                        ? 0
                        : prev.defaultNumber,
                    defaultBoolean: nextType === 'boolean' ? false : prev.defaultBoolean,
                    enumOptions: nextType === 'enum' ? prev.enumOptions : [],
                  }));
                }}
              >
                {METADATA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Required</FormLabel>
              <Switch
                size="sm"
                isChecked={metadataDraft.required}
                onChange={(event) =>
                  setMetadataDraft((prev) => ({ ...prev, required: event.target.checked }))
                }
              />
            </FormControl>
          </HStack>

          {metadataDraft.type === 'enum' && (
            <FormControl>
              <FormLabel>Enum Options</FormLabel>
              <VStack spacing={1} align="stretch">
                {metadataDraft.enumOptions.map((opt, idx) => (
                  <HStack key={idx} spacing={1}>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...metadataDraft.enumOptions];
                        next[idx] = e.target.value;
                        setMetadataDraft((prev) => ({ ...prev, enumOptions: next }));
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
                        setMetadataDraft((prev) => ({
                          ...prev,
                          enumOptions: prev.enumOptions.filter((_, i) => i !== idx),
                        }))
                      }
                    />
                  </HStack>
                ))}
                <Button
                  size="xs"
                  variant="ghost"
                  color="gray.500"
                  _hover={{ color: 'white' }}
                  leftIcon={<AddIcon fontSize="8px" />}
                  onClick={() =>
                    setMetadataDraft((prev) => ({
                      ...prev,
                      enumOptions: [...prev.enumOptions, `option_${prev.enumOptions.length + 1}`],
                    }))
                  }
                >
                  Add Option
                </Button>
              </VStack>
            </FormControl>
          )}

          <FormControl>
            <FormLabel>Default Value</FormLabel>
            {(metadataDraft.type === 'int' ||
              metadataDraft.type === 'float' ||
              metadataDraft.type === 'number') && (
              <NumberInput
                value={metadataDraft.defaultNumber}
                step={metadataDraft.type === 'int' ? 1 : 0.01}
                precision={metadataDraft.type === 'int' ? 0 : 2}
                onChange={(_, valueAsNumber) =>
                  setMetadataDraft((prev) => ({
                    ...prev,
                    defaultNumber: Number.isNaN(valueAsNumber) ? 0 : valueAsNumber,
                  }))
                }
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            )}
            {(metadataDraft.type === 'string' || metadataDraft.type === 'enum') && (
              <Input
                value={metadataDraft.defaultString}
                onChange={(event) =>
                  setMetadataDraft((prev) => ({ ...prev, defaultString: event.target.value }))
                }
              />
            )}
            {metadataDraft.type === 'boolean' && (
              <Switch
                size="sm"
                isChecked={metadataDraft.defaultBoolean}
                onChange={(event) =>
                  setMetadataDraft((prev) => ({ ...prev, defaultBoolean: event.target.checked }))
                }
              />
            )}
          </FormControl>

          <FormControl>
            <FormLabel>Description</FormLabel>
            <Input
              value={metadataDraft.description}
              onChange={(event) =>
                setMetadataDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Optional"
            />
          </FormControl>
        </EntityFormDialog>
      </EditorModal>
    </>
  );
};

export default MapSettingsEditor;
