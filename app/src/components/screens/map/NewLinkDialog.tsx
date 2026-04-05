import React, { useState, useEffect } from 'react';
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
  FormLabel,
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
  const maps = useEditorStore((s) => s.maps);
  const updateLocationLink = useEditorStore((s) => s.updateLocationLink);
  const removeLocationLink = useEditorStore((s) => s.removeLocationLink);
  const selectLink = useEditorStore((s) => s.selectLink);
  const createBidirectionalCounterpart = useEditorStore((s) => s.createBidirectionalCounterpart);

  const link = currentMap?.locationLinks?.find((l) => l.id === linkId);

  const [label, setLabel] = useState('');
  const [targetMapId, setTargetMapId] = useState('');
  const [targetPosition, setTargetPosition] = useState<[number, number]>([0, 0]);
  const [bidirectional, setBidirectional] = useState(false);

  useEffect(() => {
    if (link) {
      setLabel(link.label ?? '');
      setTargetMapId(link.targetMapId ?? '');
      setTargetPosition(link.targetPosition ?? [0, 0]);
      setBidirectional(link.direction === 'bidirectional');
    }
  }, [linkId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!linkId || !link) return null;

  const otherMaps = maps.filter((m) => m.id !== currentMap?.id);
  const isSameMap = !targetMapId || targetMapId === currentMap?.id;
  const selectedTarget = maps.find((m) => m.id === targetMapId);
  const isCrossMap = !isSameMap && !!selectedTarget;

  const handleSave = async () => {
    const updates: Partial<LocationLink> = {
      targetMapId,
      targetPosition,
      direction: bidirectional ? 'bidirectional' : 'one-way',
    };
    if (label.trim()) updates.label = label.trim();
    updateLocationLink(linkId, updates);

    // For bidirectional cross-map links, create the counterpart right away
    if (bidirectional && isCrossMap) {
      await createBidirectionalCounterpart(linkId);
    }

    onClose();
  };

  const handleCancel = () => {
    removeLocationLink(linkId);
    selectLink(null);
    onClose();
  };

  const handleSkip = () => {
    onClose();
  };

  const modalSize = 'xl';

  return (
    <Modal isOpen={true} onClose={handleCancel} size={modalSize} isCentered scrollBehavior="inside">
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
            <FormControl>
              <FormLabel
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="gray.500"
                mb={1}
              >
                Label{' '}
                <Text as="span" color="gray.600" fontWeight="normal">
                  (optional)
                </Text>
              </FormLabel>
              <Input
                size="sm"
                bg="gray.800"
                placeholder="e.g. Front Door, Cave Exit"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
            </FormControl>

            {/* Target map selector */}
            <FormControl>
              <FormLabel
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                color="gray.500"
                mb={1}
              >
                Target Map
              </FormLabel>
              <Select
                size="sm"
                bg="gray.800"
                value={targetMapId}
                onChange={(e) => {
                  setTargetMapId(e.target.value);
                  setTargetPosition([0, 0]); // reset position when map changes
                }}
              >
                <option value="">— Same map —</option>
                {otherMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
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
            </FormControl>

            {/* Direction */}
            <Checkbox
              isChecked={bidirectional}
              onChange={(e) => setBidirectional(e.target.checked)}
              colorScheme="cyan"
              size="sm"
            >
              <Text fontSize="xs" color="gray.300">
                Bidirectional ↔
                {isCrossMap && bidirectional && (
                  <Text as="span" fontSize="10px" color="cyan.500" ml={2}>
                    — will create a return link on {selectedTarget!.name}
                  </Text>
                )}
              </Text>
            </Checkbox>

            {/* Map preview picker: cross-map uses selected target, same-map uses current map */}
            {(isCrossMap || isSameMap) && (currentMap || selectedTarget) && (
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
                    Click a tile to set where the player will appear when entering from this link.
                  </Text>
                  <Box display="flex" justifyContent="center">
                    <MapPreviewPicker
                      mapId={isCrossMap ? targetMapId : currentMap!.id}
                      selectedPosition={targetPosition}
                      onSelect={(x, y) => setTargetPosition([x, y])}
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
                      ({targetPosition[0]}, {targetPosition[1]})
                    </Text>
                  </HStack>
                </Box>
              </>
            )}
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
          <Button variant="ghost" size="sm" onClick={handleSkip} color="gray.500">
            Skip
          </Button>
          <Button colorScheme="cyan" size="sm" onClick={handleSave}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default NewLinkDialog;
