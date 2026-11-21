import React from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  FormControl,
  Text,
  VStack,
} from '@chakra-ui/react';
import { LayerKind, SortingLayer } from '../../../types/schema';
import { LAYER_ICONS } from './layerConstants';
import { FieldLabel } from '../../common/Typography.tsx';

export interface LayerFormData {
  name: string;
  kind: LayerKind;
  zOrder: number;
  icon: string;
  sortingLayer: SortingLayer;
}

const SORTING_LAYER_OPTIONS: { value: SortingLayer; label: string; description: string }[] = [
  { value: 'ground', label: 'Ground', description: 'Flat, sorted by z-order (floors, paths)' },
  { value: 'above', label: 'Above', description: 'Always on top (roofs, canopy)' },
];

export interface LayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LayerFormData) => void;
  initialData: LayerFormData;
  isEditing: boolean;
  /** When set, only these kinds are available in the type selector */
  lockedKinds?: LayerKind[];
}

// locationlink is system-managed — never user-addable
const ALL_KIND_OPTIONS: { value: LayerKind; label: string }[] = [
  { value: 'terrain', label: 'Terrain (Autotiled)' },
  { value: 'water', label: 'Water (Drawn)' },
  { value: 'visual', label: 'Tile Layer' },
  { value: 'object', label: 'Object Layer' },
  { value: 'building', label: 'Buildings' },
  { value: 'entity', label: 'Entity (Objects)' },
  { value: 'collision', label: 'Collision' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'metadata', label: 'Metadata' },
];

export const LayerModal: React.FC<LayerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEditing,
  lockedKinds,
}) => {
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const kindOptions =
    lockedKinds && lockedKinds.length > 0
      ? ALL_KIND_OPTIONS.filter((o) => lockedKinds.includes(o.value))
      : ALL_KIND_OPTIONS;

  const form = useForm({
    defaultValues: initialData,
    onSubmit: async ({ value }) => {
      onSave(value);
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered initialFocusRef={nameInputRef}>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" border="1px" borderColor="editorBorderLight">
        <ModalHeader fontSize="md" pb={2}>
          {isEditing ? 'Edit Layer' : 'Add Layer'}
        </ModalHeader>
        <ModalBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <VStack spacing={4} align="stretch">
              <form.Field name="name">
                {(field) => (
                  <FormControl>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      ref={nameInputRef}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="Layer name"
                      size="sm"
                      bg="gray.800"
                    />
                  </FormControl>
                )}
              </form.Field>

              <form.Field name="kind">
                {(field) => (
                  <FormControl>
                    <FieldLabel>Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value as LayerKind);
                      }}
                      onBlur={field.handleBlur}
                      size="sm"
                      bg="gray.800"
                      isDisabled={kindOptions.length === 1}
                    >
                      {kindOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </form.Field>

              <form.Field name="zOrder">
                {(field) => (
                  <FormControl>
                    <FieldLabel>Z-Order</FieldLabel>
                    <Input
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(parseInt(e.target.value, 10) || 0)}
                      onBlur={field.handleBlur}
                      size="sm"
                      bg="gray.800"
                    />
                    <Text fontSize="10px" color="gray.500" mt={1}>
                      Lower values render first (behind higher values)
                    </Text>
                  </FormControl>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.kind}>
                {(kind) =>
                  kind !== 'object' &&
                  kind !== 'building' &&
                  kind !== 'entity' &&
                  kind !== 'terrain' &&
                  kind !== 'water' &&
                  kind !== 'navigation' &&
                  kind !== 'collision' &&
                  kind !== 'metadata' ? (
                    <form.Field name="sortingLayer">
                      {(field) => (
                        <FormControl>
                          <FieldLabel>Sorting Layer</FieldLabel>
                          <Select
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value as SortingLayer)}
                            onBlur={field.handleBlur}
                            size="sm"
                            bg="gray.800"
                          >
                            {SORTING_LAYER_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                          <Text fontSize="10px" color="gray.500" mt={1}>
                            {SORTING_LAYER_OPTIONS.find((o) => o.value === field.state.value)
                              ?.description ?? ''}
                          </Text>
                        </FormControl>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>

              <form.Field name="icon">
                {(field) => (
                  <FormControl>
                    <FieldLabel>Icon</FieldLabel>
                    <Select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      size="sm"
                      bg="gray.800"
                    >
                      {LAYER_ICONS.map((icon) => (
                        <option key={icon.value} value={icon.value}>
                          {icon.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </form.Field>
            </VStack>
          </form>
        </ModalBody>
        <ModalFooter pt={4}>
          <Button variant="ghost" size="sm" mr={2} onClick={onClose}>
            Cancel
          </Button>
          <form.Subscribe selector={(s) => s.canSubmit}>
            {(canSubmit) => (
              <Button
                colorScheme="blue"
                size="sm"
                onClick={() => void form.handleSubmit()}
                isDisabled={!canSubmit}
              >
                {isEditing ? 'Save Changes' : 'Create Layer'}
              </Button>
            )}
          </form.Subscribe>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default LayerModal;
