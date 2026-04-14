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
  Checkbox,
  FormControl,
  Input,
  Select,
  VStack,
  Text,
  HStack,
  Badge,
  Box,
  Divider,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { LocationLink } from '../../../types/schema';
import { MapPreviewPicker } from '../../common/MapPreviewPicker';
import { FieldLabel } from '../../common/Typography.tsx';

interface NewLinkDialogProps {
  linkId: string | null;
  onClose: () => void;
}

/**
 * Quick-setup dialog shown immediately after placing a new LocationLink.
 * Lets the user set label, target map, and — for cross-map links — visually
 * pick the entry position on the target map.
 */
export const NewLinkDialog: React.FC<NewLinkDialogProps> = ({ linkId, onClose }) => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const link = currentMap?.locationLinks?.find((l) => l.id === linkId);
  if (!linkId || !link) return null;
  return <NewLinkDialogForm linkId={linkId} link={link} onClose={onClose} />;
};

const NewLinkDialogForm: React.FC<{
  linkId: string;
  link: LocationLink;
  onClose: () => void;
}> = ({ linkId, link, onClose }) => {
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const selectLink = useEditorStore((s) => s.selectLink);
  const createBidirectionalCounterpart = useEditorStore((s) => s.createBidirectionalCounterpart);

  const otherMaps = maps.filter((m) => m.id !== currentMap?.id);

  const form = useForm({
    defaultValues: {
      label: link.label ?? '',
      targetMapId: link.targetMapId ?? '',
      targetPosition: (link.targetPosition ?? [0, 0]) as [number, number],
      bidirectional: link.direction === 'bidirectional',
    },
    onSubmit: async ({ value }) => {
      const updates: Partial<LocationLink> = {
        targetMapId: value.targetMapId,
        targetPosition: value.targetPosition,
        direction: value.bidirectional ? 'bidirectional' : 'one-way',
      };
      if (value.label.trim()) updates.label = value.label.trim();
      updateLocationLink(linkId, updates);

      const isCrossMap =
        value.targetMapId &&
        value.targetMapId !== currentMap?.id &&
        maps.find((m) => m.id === value.targetMapId);

      if (value.bidirectional && isCrossMap) {
        await createBidirectionalCounterpart(linkId);
      }
      onClose();
    },
  });

  const handleCancel = () => {
    removeLocationLink(linkId);
    selectLink(null);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={handleCancel} size="xl" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" border="1px" borderColor="gray.700" maxH="90vh">
        <ModalHeader fontSize="md" pb={1}>
          🔗 New Location Link
        </ModalHeader>

        <ModalBody overflowY="auto">
          <VStack spacing={4} align="stretch">
            <Text fontSize="xs" color="gray.500">
              Placed at ({link.sourcePosition[0]}, {link.sourcePosition[1]}). Configure below or
              skip to set it up later in the inspector.
            </Text>

            {/* Label */}
            <form.Field name="label">
              {(field) => (
                <FormControl>
                  <FieldLabel>
                    Label{' '}
                    <Text as="span" color="gray.600" fontWeight="normal">
                      (optional)
                    </Text>
                  </FieldLabel>
                  <Input
                    size="sm"
                    bg="gray.800"
                    placeholder="e.g. Front Door, Cave Exit"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void form.handleSubmit();
                      if (e.key === 'Escape') handleCancel();
                    }}
                  />
                </FormControl>
              )}
            </form.Field>

            {/* Target map selector */}
            <form.Field name="targetMapId">
              {(field) => (
                <FormControl>
                  <FieldLabel>Target Map</FieldLabel>
                  <Select
                    size="sm"
                    bg="gray.800"
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      // reset target position when map changes
                      form.setFieldValue('targetPosition', [0, 0]);
                    }}
                    onBlur={field.handleBlur}
                  >
                    <option value="">— Same map —</option>
                    {otherMaps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  <form.Subscribe selector={(s) => s.values.targetMapId}>
                    {(targetMapId) => {
                      const isSameMap = !targetMapId || targetMapId === currentMap?.id;
                      const selectedTarget = maps.find((m) => m.id === targetMapId);
                      return (
                        <HStack mt={1}>
                          {isSameMap ? (
                            <Badge colorScheme="red" fontSize="9px">
                              Same map
                            </Badge>
                          ) : selectedTarget ? (
                            <Badge colorScheme="cyan" fontSize="9px">
                              → {selectedTarget.name}
                            </Badge>
                          ) : null}
                        </HStack>
                      );
                    }}
                  </form.Subscribe>
                </FormControl>
              )}
            </form.Field>

            {/* Direction */}
            <form.Field name="bidirectional">
              {(field) => (
                <form.Subscribe selector={(s) => s.values}>
                  {(values) => {
                    const isSameMap = !values.targetMapId || values.targetMapId === currentMap?.id;
                    const selectedTarget = maps.find((m) => m.id === values.targetMapId);
                    const isCrossMap = !isSameMap && !!selectedTarget;
                    return (
                      <Checkbox
                        isChecked={field.state.value}
                        onChange={(e) => field.handleChange(e.target.checked)}
                        colorScheme="cyan"
                        size="sm"
                      >
                        <Text fontSize="xs" color="gray.300">
                          Bidirectional ↔
                          {isCrossMap && field.state.value && (
                            <Text as="span" fontSize="10px" color="cyan.500" ml={2}>
                              — will create a return link on {selectedTarget!.name}
                            </Text>
                          )}
                        </Text>
                      </Checkbox>
                    );
                  }}
                </form.Subscribe>
              )}
            </form.Field>

            {/* Map preview picker */}
            <form.Subscribe selector={(s) => s.values}>
              {(values) => {
                const isSameMap = !values.targetMapId || values.targetMapId === currentMap?.id;
                const selectedTarget = maps.find((m) => m.id === values.targetMapId);
                const isCrossMap = !isSameMap && !!selectedTarget;

                if (!currentMap && !selectedTarget) return null;

                return (
                  <>
                    <Divider borderColor="whiteAlpha.100" />
                    <Box>
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        textTransform="uppercase"
                        color="gray.500"
                        letterSpacing="wide"
                        mb={2}
                      >
                        Entry Position on {isCrossMap ? selectedTarget!.name : 'This Map'}
                      </Text>
                      <Text fontSize="10px" color="gray.600" mb={3}>
                        Click a tile to set where the player will appear when entering from this
                        link.
                      </Text>
                      <Box display="flex" justifyContent="center">
                        <MapPreviewPicker
                          mapId={isCrossMap ? values.targetMapId : currentMap!.id}
                          selectedPosition={values.targetPosition}
                          onSelect={(x, y) => form.setFieldValue('targetPosition', [x, y])}
                          width={520}
                          height={300}
                          interactive={true}
                        />
                      </Box>
                      <HStack mt={2} justify="center">
                        <Text fontSize="10px" color="gray.500">
                          Entry at
                        </Text>
                        <Text fontSize="10px" color="cyan.300" fontFamily="mono">
                          ({values.targetPosition[0]}, {values.targetPosition[1]})
                        </Text>
                      </HStack>
                    </Box>
                  </>
                );
              }}
            </form.Subscribe>
          </VStack>
        </ModalBody>

        <ModalFooter pt={3} gap={2} borderTop="1px" borderColor="whiteAlpha.100">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            color="red.400"
            _hover={{ color: 'red.300' }}
          >
            Cancel
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} color="gray.500">
            Skip
          </Button>
          <form.Subscribe selector={(s) => s.canSubmit}>
            {(canSubmit) => (
              <Button
                colorScheme="cyan"
                size="sm"
                onClick={() => void form.handleSubmit()}
                isDisabled={!canSubmit}
              >
                Save
              </Button>
            )}
          </form.Subscribe>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default NewLinkDialog;
