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
import { CardinalDirectionPicker } from '../../common/CardinalDirectionPicker';
import { FieldLabel } from '../../common/Typography.tsx';
import { DEFAULT_LINK_FACING } from '../../../lib/locationLinkUtils';

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
  const projectTileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  const currentMap = useEditorStore((s) => s.currentMap);
  const maps = useEditorStore((s) => s.maps);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const selectLink = useEditorStore((s) => s.selectLink);
  const createTargetAnchorForLink = useEditorStore((s) => s.createTargetAnchorForLink);

  const otherMaps = maps.filter((m) => m.id !== currentMap?.id);

  const form = useForm({
    defaultValues: {
      label: link.label ?? '',
      sourcePosition: [
        Math.floor(link.sourcePosition[0] / projectTileSize),
        Math.floor(link.sourcePosition[1] / projectTileSize),
      ] as [number, number],
      targetMapId: link.targetMapId ?? '',
      targetLinkId: link.targetLinkId ?? '',
      // Present targetPosition as tile coords for the map picker
      targetPosition: (link.targetPosition
        ? [
            Math.floor(link.targetPosition[0] / projectTileSize),
            Math.floor(link.targetPosition[1] / projectTileSize),
          ]
        : [0, 0]) as [number, number],
      targetFacing: (link.targetFacing ?? DEFAULT_LINK_FACING) as [number, number],
    },
    onSubmit: async ({ value }) => {
      const updates: Partial<LocationLink> = {
        sourcePosition: [
          value.sourcePosition[0] * projectTileSize,
          value.sourcePosition[1] * projectTileSize,
        ],
        targetMapId: value.targetMapId,
        targetLinkId: value.targetLinkId || undefined,
        // Convert picked tile coords back to pixel coords when saving
        targetPosition: [
          value.targetPosition[0] * projectTileSize,
          value.targetPosition[1] * projectTileSize,
        ],
        targetFacing: value.targetFacing,
      };
      if (value.label.trim()) updates.label = value.label.trim();
      updateLocationLink(linkId, updates);

      const isCrossMapCustomArrival =
        !!value.targetMapId && value.targetMapId !== currentMap?.id && !value.targetLinkId;
      if (isCrossMapCustomArrival) {
        await createTargetAnchorForLink(linkId);
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
    <Modal isOpen={true} onClose={handleCancel} size="4xl" isCentered scrollBehavior="inside">
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
            <Text fontSize="10px" color="gray.500">
              This dialog creates a one-way link. Add a second link later if you also want a return
              path.
            </Text>

            <Divider borderColor="whiteAlpha.100" />

            <form.Field name="sourcePosition">
              {(field) => (
                <Box>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    textTransform="uppercase"
                    color="gray.500"
                    letterSpacing="wide"
                    mb={2}
                  >
                    From
                  </Text>
                  <Text fontSize="10px" color="gray.600" mb={3}>
                    Pick the source trigger tile. The dialog keeps it one tile wide for now.
                  </Text>
                  <Box display="flex" justifyContent="center">
                    <MapPreviewPicker
                      mapId={currentMap!.id}
                      onSelect={(x, y) => field.handleChange([x, y])}
                      width={520}
                      height={220}
                      interactive={true}
                      overlays={[
                        {
                          kind: 'trigger',
                          position: field.state.value,
                          size: [1, 1],
                          color: 'rgba(245, 158, 11, 0.95)',
                        },
                      ]}
                    />
                  </Box>
                  <HStack mt={2} justify="center">
                    <Text fontSize="10px" color="gray.500">
                      Trigger tile
                    </Text>
                    <Text fontSize="10px" color="orange.300" fontFamily="mono">
                      ({field.state.value[0]}, {field.state.value[1]})
                    </Text>
                  </HStack>
                </Box>
              )}
            </form.Field>

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
                      form.setFieldValue('targetLinkId', '');
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

            <form.Subscribe selector={(s) => s.values.targetMapId}>
              {(targetMapId) => {
                const targetMap = maps.find((m) => m.id === targetMapId) ?? currentMap;
                const availableLinks = (targetMap?.locationLinks ?? []).filter(
                  (candidate) => candidate.id !== link.id,
                );

                return (
                  <form.Field name="targetLinkId">
                    {(field) => (
                      <FormControl>
                        <FieldLabel>Target Link</FieldLabel>
                        <Select
                          size="sm"
                          bg="gray.800"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                        >
                          <option value="">Custom arrival position</option>
                          {availableLinks.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label || candidate.id}
                            </option>
                          ))}
                        </Select>
                        <Text fontSize="10px" color="gray.500" mt={1}>
                          Prefer targeting another link. Its visible arrival anchor defines where
                          actors land.
                        </Text>
                      </FormControl>
                    )}
                  </form.Field>
                );
              }}
            </form.Subscribe>

            <form.Field name="targetFacing">
              {(field) => (
                <FormControl>
                  <FieldLabel>Arrival Facing</FieldLabel>
                  <CardinalDirectionPicker
                    value={field.state.value}
                    onChange={field.handleChange}
                    size="sm"
                  />
                </FormControl>
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
                        To
                      </Text>
                      <Text fontSize="10px" color="gray.600" mb={3}>
                        {values.targetLinkId
                          ? 'Used only if the target link has no arrival anchor.'
                          : `Pick the arrival tile on ${isCrossMap ? selectedTarget!.name : 'this map'}.`}
                      </Text>
                      <Box display="flex" justifyContent="center">
                        <MapPreviewPicker
                          mapId={isCrossMap ? values.targetMapId : currentMap!.id}
                          onSelect={(x, y) => form.setFieldValue('targetPosition', [x, y])}
                          width={520}
                          height={220}
                          interactive={true}
                          overlays={[
                            {
                              kind: 'arrival',
                              position: values.targetPosition,
                              facing: values.targetFacing,
                              color: 'rgba(34, 211, 238, 0.95)',
                            },
                          ]}
                        />
                      </Box>
                      <HStack mt={2} justify="center">
                        <Text fontSize="10px" color="gray.500">
                          Arrival tile
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
