import { EditorFormSave } from '../../common/EditorFormSave';
import React, { useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Box,
  Button,
  Divider,
  FormControl,
  GridItem,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInputStepper,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { CompactNumberInput, FieldStack, ReadOnlyIdField } from '../../common/Fields';
import { FieldLabel } from '../../common/Typography.tsx';
import { ComboboxInput } from '../../common/ComboboxInput';
import { Item } from '../../../types/schema';
import { fileSystem } from '../../../lib/fileSystem';
import { PropertyForm, propertyDefinitionsToSchema } from '../../common/PropertyForm';
import { GiChest } from 'react-icons/gi';

export const ItemEditor: React.FC = () => {
  const items = useEditorStore((state) => state.items);
  const selectedItemId = useEditorStore((state) => state.selectedItemId);
  const updateItem = useEditorStore((state) => state.updateItem);
  const addItem = useEditorStore((state) => state.addItem);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const knownCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of items) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [items]);

  const emptyContent = (
    <EmptyScreen
      icon={<GiChest />}
      title={items.length ? 'No Item Selected' : 'No Items'}
      description={
        items.length
          ? 'Select an item from the list to edit its details.'
          : 'Define items that can be picked up, used, or traded in the game world.'
      }
      buttonLabel={items.length ? undefined : 'Create First Item'}
      onCreate={items.length ? undefined : onOpen}
    />
  );

  const centerContent = selectedItem ? (
    <ItemDetail item={selectedItem} knownCategories={knownCategories} onUpdate={updateItem} />
  ) : (
    emptyContent
  );

  return (
    <>
      {centerContent}

      <CreateItemDialog
        idPrefix={useEditorStore.getState().project?.idPrefix ?? 'base'}
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
}> = ({ item, knownCategories, onUpdate }) => {
  const itemClasses = useEditorStore((state) => state.itemClasses);

  let form: ReturnType<typeof useForm<any, any, any, any, any, any, any, any, any, any, any, any>>;
  form = useForm({
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
      form.reset(value);
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
      <VStack align="stretch" spacing={6}>
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6} alignItems="start">
          <GridItem>
            <Box>
              <FieldStack>
                <FormControl>
                  <FieldLabel>ID</FieldLabel>
                  <ReadOnlyIdField value={item.id} />
                </FormControl>

                <form.Field name="name">
                  {(field) => (
                    <FormControl>
                      <FieldLabel>Name</FieldLabel>
                      <Input
                        size="sm"
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
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        >
                          <option value="">-- None --</option>
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
                        rows={5}
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
                      <CompactNumberInput
                        min={1}
                        value={field.state.value}
                        onChange={(_, val) => field.handleChange(isNaN(val) ? 1 : val)}
                        onBlur={field.handleBlur}
                      >
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </CompactNumberInput>
                    </FormControl>
                  )}
                </form.Field>
              </FieldStack>
            </Box>
          </GridItem>

          <GridItem>
            <Box>
              <VStack align="stretch" spacing={5}>
                <VStack align="stretch" spacing={3}>
                  <Text
                    fontSize="xs"
                    fontWeight="black"
                    color="editorMutedText"
                    textTransform="uppercase"
                    letterSpacing="widest"
                    pb={2}
                    borderBottom="1px"
                    borderColor="editorShellBorder"
                  >
                    Assets
                  </Text>

                  <form.Field name="icon">
                    {(field) => (
                      <FormControl>
                        <FieldLabel>Icon</FieldLabel>
                        <HStack spacing={2}>
                          <Input
                            size="sm"
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
                            Browse...
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
                            Browse...
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
                        <Divider />
                        <VStack align="stretch" spacing={3}>
                          <Text
                            fontSize="xs"
                            fontWeight="black"
                            color="editorMutedText"
                            textTransform="uppercase"
                            letterSpacing="widest"
                            pb={2}
                            borderBottom="1px"
                            borderColor="editorShellBorder"
                          >
                            {selectedClass.name} Properties
                          </Text>
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
              </VStack>
            </Box>
          </GridItem>
        </SimpleGrid>

        <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, values: state.values })}>
          {({ isDirty, values }) => (
            <EditorFormSave
              kind="item"
              resourceId={item.id}
              isDirty={isDirty}
              values={values}
              onSave={() => form.handleSubmit()}
            />
          )}
        </form.Subscribe>
      </VStack>
    </form>
  );
};

export default ItemEditor;
