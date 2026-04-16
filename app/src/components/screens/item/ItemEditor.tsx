import React, { useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Button,
  Divider,
  FormControl,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Select,
  Text,
  Textarea,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { CheckIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
import { DetailPanel } from '../../common/DetailPanel';
import { useFilteredList } from '../../../hooks/useFilteredList';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { FieldLabel } from '../../common/Typography.tsx';
import { SectionLabel } from '../../common/Typography.tsx';
import { ComboboxInput } from '../../common/ComboboxInput';
import { Item } from '../../../types/schema';
import { fileSystem } from '../../../lib/fileSystem';
import { PropertyForm, propertyDefinitionsToSchema } from '../../common/PropertyForm';
import { GiChest } from 'react-icons/gi';

export const ItemEditor: React.FC = () => {
  const items = useEditorStore((state) => state.items);
  const selectedItemId = useEditorStore((state) => state.selectedItemId);
  const setSelectedItem = useEditorStore((state) => state.setSelectedItem);
  const updateItem = useEditorStore((state) => state.updateItem);
  const deleteItem = useEditorStore((state) => state.deleteItem);
  const addItem = useEditorStore((state) => state.addItem);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = React.useState('');

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const knownCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [items]);

  const listItems: ListPanelItem[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        label: item.name,
        sublabel: item.category || item.id,
        icon: <GiChest size={18} />,
      })),
    [items],
  );

  const filteredItems = useFilteredList(listItems, search);

  const deleteItemById = async (id: string, name: string) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    await deleteItem(id);
  };

  const leftPanel = (
    <ListPanel
      title="Items"
      items={filteredItems}
      selectedId={selectedItemId}
      onSelect={setSelectedItem}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No items defined"
      topContent={
        <Input
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          bg="#0a0a0b"
          borderColor="#333"
          color="gray.100"
        />
      }
      onDeleteItem={async (listItem) => {
        const item = items.find((entry) => entry.id === listItem.id);
        if (!item) return;
        await deleteItemById(item.id, item.name);
      }}
      deleteActionLabel="Delete item"
    />
  );

  const emptyContent =
    items.length === 0 ? (
      <EmptyScreen
        icon={<GiChest />}
        title="No Items"
        description="Define items that can be picked up, used, or traded in the game world."
        buttonLabel="Create First Item"
        onCreate={onOpen}
      />
    ) : (
      <EmptyScreen
        icon={<GiChest />}
        title="No Item Selected"
        description="Select an item from the list to edit its details."
      />
    );

  const centerContent = selectedItem ? (
    <DetailPanel key={selectedItem.id}>
      <ItemDetail
        item={selectedItem}
        knownCategories={knownCategories}
        onUpdate={updateItem}
        onDelete={async () => deleteItemById(selectedItem.id, selectedItem.name)}
      />
    </DetailPanel>
  ) : (
    emptyContent
  );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Items',
          subtitle: `${items.length} item${items.length !== 1 ? 's' : ''} defined`,
        }}
        content={centerContent}
        leftPanel={leftPanel}
        leftPanelDefaultSize={18}
      />

      <CreateItemDialog
        isOpen={isOpen}
        title="New Item"
        itemType="Item"
        existingIds={items.map((i) => i.id)}
        onClose={onClose}
        onSubmit={async ({ id, name }) => {
          await addItem({
            id,
            name,
            category: '',
            icon: '',
            description: '',
            maxStackSize: 99,
          });
          onClose();
        }}
      />
    </>
  );
};

const ItemDetail: React.FC<{
  item: Item;
  knownCategories: string[];
  onUpdate: (id: string, updates: Partial<Item>) => Promise<void>;
  onDelete: () => void;
}> = ({ item, knownCategories, onUpdate, onDelete }) => {
  const itemClasses = useEditorStore((state) => state.itemClasses);

  const form = useForm({
    defaultValues: {
      name: item.name,
      category: item.category,
      icon: item.icon,
      description: item.description,
      maxStackSize: item.maxStackSize,
      pickupSound: item.pickupSound ?? '',
      classId: item.classId ?? '',
      classProperties: item.classProperties ?? {},
    },
    onSubmit: async ({ value }) => {
      await onUpdate(item.id, {
        ...value,
        pickupSound: value.pickupSound || undefined,
        classId: value.classId || undefined,
        classProperties:
          Object.keys(value.classProperties).length > 0 ? value.classProperties : undefined,
      });
    },
  });

  const handlePickIcon = async (onChange: (path: string) => void) => {
    try {
      const absolutePath = await fileSystem.selectAsset();
      if (!absolutePath) return;
      const blob = await fileSystem.readFileAsBlob(absolutePath);
      const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'icon.png';
      const relativePath = await fileSystem.saveAsset(filename, blob);
      onChange(relativePath);
    } catch (e) {
      console.error('Failed to pick icon:', e);
    }
  };

  const handlePickSound = async (onChange: (path: string) => void) => {
    try {
      const absolutePath = await fileSystem.selectAsset();
      if (!absolutePath) return;
      const blob = await fileSystem.readFileAsBlob(absolutePath);
      const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'pickup.wav';
      const relativePath = await fileSystem.saveAsset(filename, blob);
      onChange(relativePath);
    } catch (e) {
      console.error('Failed to pick sound:', e);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <VStack align="stretch" spacing={5}>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FieldLabel>ID</FieldLabel>
            <Text fontSize="xs" fontFamily="mono" color="gray.400">
              {item.id}
            </Text>
          </FormControl>

          <form.Field name="name">
            {(field) => (
              <FormControl>
                <FieldLabel>Name</FieldLabel>
                <Input
                  size="sm"
                  bg="gray.950"
                  color="white"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormControl>
            )}
          </form.Field>

          <form.Field name="category">
            {(field) => (
              <FormControl>
                <FieldLabel>Category</FieldLabel>
                <ComboboxInput
                  size="sm"
                  bg="gray.950"
                  color="white"
                  placeholder="e.g. Consumable, Weapon, Tool"
                  value={field.state.value}
                  options={knownCategories}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v)}
                />
              </FormControl>
            )}
          </form.Field>

          {itemClasses.length > 0 && (
            <form.Field name="classId">
              {(field) => (
                <FormControl>
                  <FieldLabel>Item Class</FieldLabel>
                  <Select
                    size="sm"
                    bg="gray.950"
                    color="white"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {itemClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
            </form.Field>
          )}

          <form.Field name="description">
            {(field) => (
              <FormControl>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  size="sm"
                  bg="gray.950"
                  color="white"
                  rows={4}
                  resize="vertical"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormControl>
            )}
          </form.Field>

          <form.Field name="maxStackSize">
            {(field) => (
              <FormControl>
                <FieldLabel>Max Stack Size</FieldLabel>
                <NumberInput
                  size="sm"
                  min={1}
                  value={field.state.value}
                  onChange={(_, val) => field.handleChange(isNaN(val) ? 1 : val)}
                  onBlur={field.handleBlur}
                >
                  <NumberInputField bg="gray.950" color="white" />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            )}
          </form.Field>
        </VStack>

        <Divider borderColor="#071018" />

        <VStack align="stretch" spacing={3}>
          <SectionLabel>Assets</SectionLabel>

          <form.Field name="icon">
            {(field) => (
              <FormControl>
                <FieldLabel>Icon</FieldLabel>
                <HStack spacing={2}>
                  <Input
                    size="sm"
                    bg="gray.950"
                    color="white"
                    fontFamily="mono"
                    placeholder="assets/icons/my-item.png"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    flex={1}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="gray"
                    flexShrink={0}
                    onClick={() => handlePickIcon((p) => field.handleChange(p))}
                  >
                    Browse…
                  </Button>
                </HStack>
              </FormControl>
            )}
          </form.Field>

          <form.Field name="pickupSound">
            {(field) => (
              <FormControl>
                <FieldLabel>Pickup Sound (optional)</FieldLabel>
                <HStack spacing={2}>
                  <Input
                    size="sm"
                    bg="gray.950"
                    color="white"
                    fontFamily="mono"
                    placeholder="assets/audio/pickup.wav"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    flex={1}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="gray"
                    flexShrink={0}
                    onClick={() => handlePickSound((p) => field.handleChange(p))}
                  >
                    Browse…
                  </Button>
                  {field.state.value && (
                    <Button
                      size="sm"
                      variant="ghost"
                      color="red.400"
                      flexShrink={0}
                      onClick={() => field.handleChange('')}
                    >
                      Clear
                    </Button>
                  )}
                </HStack>
              </FormControl>
            )}
          </form.Field>
        </VStack>

        <form.Subscribe selector={(s) => s.values.classId}>
          {(classId) => {
            const selectedClass = itemClasses.find((c) => c.id === classId);
            if (!selectedClass || selectedClass.properties.length === 0) return null;
            return (
              <>
                <Divider borderColor="#071018" />
                <VStack align="stretch" spacing={3}>
                  <SectionLabel>{selectedClass.name} Properties</SectionLabel>
                  <form.Field name="classProperties">
                    {(field) => (
                      <PropertyForm
                        schema={propertyDefinitionsToSchema(selectedClass.properties)}
                        values={field.state.value}
                        onChange={(key, value) =>
                          field.handleChange({ ...field.state.value, [key]: value })
                        }
                      />
                    )}
                  </form.Field>
                </VStack>
              </>
            );
          }}
        </form.Subscribe>

        <Divider borderColor="#071018" />

        <HStack justify="space-between">
          <Button
            size="xs"
            colorScheme="red"
            variant="outline"
            leftIcon={<DeleteIcon fontSize="10px" />}
            onClick={onDelete}
          >
            Delete Item
          </Button>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
          >
            {([canSubmit, isSubmitting, isDirty]) => (
              <Button
                size="xs"
                colorScheme="blue"
                type="submit"
                disabled={!canSubmit}
                isLoading={isSubmitting}
                opacity={isDirty ? 1 : 0.5}
                leftIcon={<CheckIcon fontSize="10px" />}
              >
                Save Changes
              </Button>
            )}
          </form.Subscribe>
        </HStack>
      </VStack>
    </form>
  );
};

export default ItemEditor;
