import React, { useState, useMemo } from 'react';
import { Box, HStack, Text, Input, Select, FormControl, FormLabel, Flex } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { EntityType, EntityCategory } from '../../../types/schema';
import { EntityFormDialog } from '../common';
import { IconPicker } from '../common/FormFields';

const CATEGORIES: { value: EntityCategory; label: string; icon: string }[] = [
  { value: 'object', label: 'Object', icon: '📦' },
  { value: 'trigger', label: 'Trigger', icon: '⚡' },
  { value: 'spawn', label: 'Spawn', icon: '🎯' },
  { value: 'transition', label: 'Transition', icon: '🚪' },
  { value: 'decoration', label: 'Decoration', icon: '🌿' },
];

const DEFAULT_COLORS = [
  '#3182ce',
  '#805ad5',
  '#d69e2e',
  '#e53e3e',
  '#38a169',
  '#dd6b20',
  '#d53f8c',
  '#319795',
  '#718096',
  '#8B4513',
];

interface CreateEntityTypeDialogProps {
  onClose: () => void;
}

export const CreateEntityTypeDialog: React.FC<CreateEntityTypeDialogProps> = ({ onClose }) => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const addEntityType = useEditorStore((state) => state.addEntityType);

  const [name, setName] = useState('');
  const [customId, setCustomId] = useState('');
  const [category, setCategory] = useState<EntityCategory>('object');
  const [icon, setIcon] = useState('GiYinYang');
  const [group, setGroup] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [description, setDescription] = useState('');

  const derivedId = useMemo(() => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }, [name]);

  const id = customId.trim() || derivedId;

  const isDuplicate = entityTypes.some((et) => et.id === id);
  const isValid = id.length > 0 && !isDuplicate;

  // Gather existing groups for autocomplete hints
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    entityTypes.forEach((et) => {
      if (et.group) groups.add(et.group);
    });
    return Array.from(groups).sort();
  }, [entityTypes]);

  const handleCreate = async () => {
    if (!isValid) return;

    const newEntityType: EntityType = {
      id,
      displayName: name.trim(),
      category,
      icon,
      group: group.trim() || undefined,
      description: description.trim() || undefined,
      placeholderColor: color,
      properties: [],
      defaultSize: [1, 1],
    };

    await addEntityType(newEntityType);
    onClose();
  };

  return (
    <EntityFormDialog
      title="New Entity Type"
      onCancel={onClose}
      onSubmit={handleCreate}
      submitLabel="Create Entity Type"
      isSubmitDisabled={!isValid}
      minWidth="420px"
    >
      {/* Name */}
      <FormControl isRequired>
        <FormLabel fontSize="xs" color="gray.400">
          Display Name
        </FormLabel>
        <Input
          size="sm"
          bg="gray.800"
          color="white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Treasure Chest"
          autoFocus
        />
      </FormControl>

      {/* ID (editable, auto-derived from name) */}
      <FormControl>
        <FormLabel fontSize="xs" color="gray.400">
          ID
        </FormLabel>
        <Input
          size="sm"
          bg="gray.800"
          color="white"
          fontFamily="mono"
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          placeholder={derivedId || 'auto-generated from name'}
          isInvalid={isDuplicate}
        />
        {isDuplicate && (
          <Text fontSize="10px" color="red.400" mt={1}>
            ID already exists
          </Text>
        )}
        {!customId && derivedId && (
          <Text fontSize="10px" color="gray.600" mt={1}>
            Will use:{' '}
            <Box as="span" fontFamily="mono">
              {derivedId}
            </Box>
          </Text>
        )}
      </FormControl>

      {/* Category & Group */}
      <HStack spacing={4} align="start">
        <FormControl flex={1}>
          <FormLabel fontSize="xs" color="gray.400">
            Category
          </FormLabel>
          <Select
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={category}
            onChange={(e) => setCategory(e.target.value as EntityCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} style={{ background: '#1a202c' }}>
                {c.icon} {c.label}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl flex={1}>
          <FormLabel fontSize="xs" color="gray.400">
            Group
          </FormLabel>
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="e.g. Interactables"
            list="entity-groups"
          />
          {existingGroups.length > 0 && (
            <datalist id="entity-groups">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          )}
        </FormControl>
      </HStack>

      {/* Icon & Color */}
      <HStack spacing={4} align="start">
        <FormControl>
          <FormLabel
            color="gray.500"
            fontSize="10px"
            fontWeight="black"
            textTransform="uppercase"
            mb={1}
          >
            Icon
          </FormLabel>
          <IconPicker value={icon} onChange={(v) => setIcon(v ?? '')} />
        </FormControl>

        <FormControl w="100px" flexShrink={0}>
          <FormLabel fontSize="xs" color="gray.400">
            Color
          </FormLabel>
          <Flex gap={1} flexWrap="wrap">
            {DEFAULT_COLORS.map((c) => (
              <Box
                key={c}
                w="20px"
                h="20px"
                bg={c}
                borderRadius="sm"
                cursor="pointer"
                borderWidth="2px"
                borderColor={color === c ? 'white' : 'transparent'}
                _hover={{ transform: 'scale(1.2)' }}
                transition="all 0.1s"
                onClick={() => setColor(c)}
              />
            ))}
          </Flex>
        </FormControl>
      </HStack>

      {/* Description */}
      <FormControl>
        <FormLabel fontSize="xs" color="gray.400">
          Description
        </FormLabel>
        <Input
          size="sm"
          bg="gray.800"
          color="white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description (optional)"
        />
      </FormControl>
    </EntityFormDialog>
  );
};
