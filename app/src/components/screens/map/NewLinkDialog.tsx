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
  Divider,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { LocationLink } from '../../../types/schema';
import { FieldLabel } from '../../common/Typography.tsx';

interface NewLinkDialogProps {
  linkId: string | null;
  onClose: () => void;
}

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

  const form = useForm({
    defaultValues: {
      label: link.label ?? '',
      triggerId: link.triggerId ?? '',
      targetMapId: link.targetMapId ?? '',
      targetAnchorId: link.targetAnchorId ?? '',
    },
    onSubmit: async ({ value }) => {
      const updates: Partial<LocationLink> = {
        triggerId: value.triggerId,
        targetMapId: value.targetMapId,
        targetAnchorId: value.targetAnchorId,
      };
      if (value.label.trim()) updates.label = value.label.trim();
      updateLocationLink(linkId, updates);
      onClose();
    },
  });

  const handleCancel = () => {
    removeLocationLink(linkId);
    selectLink(null);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={handleCancel} size="md" isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" border="1px" borderColor="gray.700">
        <ModalHeader fontSize="md" pb={1}>
          New Location Link
        </ModalHeader>

        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Text fontSize="xs" color="gray.500">
              Configure this link or skip — you can always edit it later in the inspector.
            </Text>

            <Divider borderColor="whiteAlpha.100" />

            <form.Field name="triggerId">
              {(field) => (
                <FormControl>
                  <FieldLabel>Source Trigger</FieldLabel>
                  <Select
                    size="sm"
                    bg="gray.800"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  >
                    <option value="">— Select a trigger —</option>
                    {(currentMap?.spatialPrimitives?.triggers ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label || t.id}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
            </form.Field>

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

            <Divider borderColor="whiteAlpha.100" />

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
                      form.setFieldValue('targetAnchorId', '');
                    }}
                    onBlur={field.handleBlur}
                  >
                    <option value="">— Select a map —</option>
                    {maps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.id === currentMap?.id ? ' (same map)' : ''}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.values.targetMapId}>
              {(targetMapId) => {
                const targetMap = maps.find((m) => m.id === targetMapId);
                const anchors = targetMap?.spatialPrimitives?.anchors ?? [];
                return (
                  <form.Field name="targetAnchorId">
                    {(field) => (
                      <FormControl>
                        <FieldLabel>Arrival Anchor</FieldLabel>
                        <Select
                          size="sm"
                          bg="gray.800"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          isDisabled={!targetMap}
                        >
                          <option value="">— Select an anchor —</option>
                          {anchors.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                        <Text fontSize="10px" color="gray.500" mt={1}>
                          Anchor on the target map that sets where characters arrive.
                        </Text>
                      </FormControl>
                    )}
                  </form.Field>
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
