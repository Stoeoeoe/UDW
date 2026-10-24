import React, { useMemo } from 'react';
import { Box, HStack, Select, FormControl, Flex, VStack, Input } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { EntityType, EntityCategory } from '../../../types/schema';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { IconPicker } from '../common/FormFields';
import { FormLabel, FormLabelUppercase } from '../../common/FormLabel';

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
  isOpen?: boolean;
}

export const CreateEntityTypeDialog: React.FC<CreateEntityTypeDialogProps> = ({
  onClose,
  isOpen,
}) => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const addEntityType = useEditorStore((state) => state.addEntityType);

  const [category, setCategory] = React.useState<EntityCategory>('object');
  const [icon, setIcon] = React.useState('GiYinYang');
  const [group, setGroup] = React.useState('');
  const [color, setColor] = React.useState(DEFAULT_COLORS[0]);
  const [description, setDescription] = React.useState('');

  const existingIds = useMemo(() => {
    return entityTypes.map((et) => et.id);
  }, [entityTypes]);

  // Gather existing groups for autocomplete hints
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    entityTypes.forEach((et) => {
      if (et.group) groups.add(et.group);
    });
    return Array.from(groups).sort();
  }, [entityTypes]);

  const handleCreate = async (data: { id: string; name: string }) => {
    const newEntityType: EntityType = {
      id: data.id,
      displayName: data.name,
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

  const additionalFields = (
    <VStack spacing={4} align="stretch" mt={3}>
      {/* Category & Group */}
      <HStack spacing={4} align="start">
        <FormControl flex={1}>
          <FormLabel>Category</FormLabel>
          <Select
            size="sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as EntityCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl flex={1}>
          <FormLabel>Group</FormLabel>
          <Input
            size="sm"
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
          <FormLabelUppercase mb={1}>Icon</FormLabelUppercase>
          <IconPicker value={icon} onChange={(v) => setIcon(v ?? '')} />
        </FormControl>

        <FormControl w="100px" flexShrink={0}>
          <FormLabel>Color</FormLabel>
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
        <FormLabel>Description</FormLabel>
        <Input
          size="sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description (optional)"
        />
      </FormControl>
    </VStack>
  );

  return (
    <CreateItemDialog
      idPrefix={useEditorStore.getState().project?.idPrefix ?? 'base'}
      isOpen={isOpen}
      title="New Entity Type"
      itemType="Entity Type"
      existingIds={existingIds}
      onSubmit={handleCreate}
      onClose={onClose}
      additionalFields={additionalFields}
    />
  );
};
