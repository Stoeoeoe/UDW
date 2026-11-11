import React, { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  HStack,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  ModalHeader,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { Anchor, Map as GameMap, MapTrigger } from '../../../types/schema';
import type { ConnectionSide, LocationConnection } from '../../../lib/locationConnection';
import { buildLocationConnection } from '../../../lib/locationConnection';
import { useProject } from '../../../hooks/useProject';
import { MapPreviewPicker, type MapPreviewOverlay } from '../../common/MapPreviewPicker';
import { CardinalDirectionPicker } from '../../common/CardinalDirectionPicker';
import { EditorModal } from '../../common/EditorModal';
import { CompactInput, CompactSelect, Field, InlineNumberPair } from '../../common/Fields';

const facingLabel = (facing: Anchor['facing']) => {
  if (!facing) return 'not set';
  const [x, y] = facing;
  if (x === 0 && y < 0) return 'Up';
  if (x === 0 && y > 0) return 'Down';
  if (y === 0 && x < 0) return 'Left';
  if (y === 0 && x > 0) return 'Right';
  return `(${facing.join(', ')})`;
};
const newSide = (mapId: string): ConnectionSide => ({
  mapId,
  trigger: null,
  anchor: null,
  linkType: 'door',
});

/** Draft-only editor: selecting and placing never writes to the project. */
function SideEditor({
  map,
  side,
  onChange,
  triggerEnabled,
  anchorEnabled,
  readOnly = false,
  confirmed,
  onConfirm,
  tileSize,
}: {
  map: GameMap;
  side: ConnectionSide;
  onChange: (side: ConnectionSide) => void;
  triggerEnabled: boolean;
  anchorEnabled: boolean;
  readOnly?: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  tileSize: number;
}) {
  const [placement, setPlacement] = useState<'trigger' | 'anchor' | null>(null);
  const [corner, setCorner] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const existingAnchor = map.spatialPrimitives?.anchors?.some(
    (item) => item.id === side.anchor?.id,
  );
  const existingTrigger = map.spatialPrimitives?.triggers?.some(
    (item) => item.id === side.trigger?.id,
  );
  const rectangle = (
    a: [number, number],
    b: [number, number],
  ): Pick<MapTrigger, 'position' | 'size'> => ({
    position: [Math.min(a[0], b[0]) * tileSize, Math.min(a[1], b[1]) * tileSize],
    size: [(Math.abs(a[0] - b[0]) + 1) * tileSize, (Math.abs(a[1] - b[1]) + 1) * tileSize],
  });
  const overlays: MapPreviewOverlay[] = [];
  const trigger =
    placement === 'trigger' && corner && hover
      ? { ...rectangle(corner, hover), points: undefined }
      : side.trigger;
  if (triggerEnabled && trigger?.position)
    overlays.push({
      kind: 'trigger',
      position: [trigger.position[0] / tileSize, trigger.position[1] / tileSize],
      size: trigger.size && [trigger.size[0] / tileSize, trigger.size[1] / tileSize],
      points: trigger.points?.map(([x, y]) => [x / tileSize, y / tileSize]),
    });
  if (anchorEnabled && side.anchor)
    overlays.push({
      kind: 'anchor',
      position: [
        side.anchor.position[0] / tileSize - 0.5,
        side.anchor.position[1] / tileSize - 0.5,
      ],
      facing: side.anchor.facing,
    });
  const pick = (x: number, y: number) => {
    if (placement === 'trigger') {
      if (!corner) {
        setCorner([x, y]);
        return;
      }
      onChange({
        ...side,
        trigger: {
          id: `trigger-${crypto.randomUUID()}`,
          label: `Exit from ${map.name}`,
          type: 'locationLinkTrigger',
          shape: 'rectangle',
          ...rectangle(corner, [x, y]),
        },
      });
      setCorner(null);
      setPlacement(null);
    } else if (placement === 'anchor') {
      onChange({
        ...side,
        anchor: {
          id: `anchor-${crypto.randomUUID()}`,
          name: `Arrival in ${map.name}`,
          position: [(x + 0.5) * tileSize, (y + 0.5) * tileSize],
          facing: [0, 1],
          tags: [],
        },
      });
      onConfirm(false);
      setPlacement(null);
    }
  };
  return (
    <VStack
      align="stretch"
      spacing={3}
      border="1px"
      borderColor="editorShellBorder"
      borderRadius="md"
      p={3}
    >
      <Text fontWeight="bold">{map.name}</Text>
      <Box alignSelf="center">
        <MapPreviewPicker
          mapId={map.id}
          width={280}
          height={230}
          initialZoom={1}
          wheelZoom={false}
          interactive={!readOnly && !!placement}
          onSelect={pick}
          overlays={overlays}
          positionPick={
            !readOnly && placement === 'trigger'
              ? {
                  mode: 'tile',
                  onPick: ({ x, y }) => pick(Math.floor(x / tileSize), Math.floor(y / tileSize)),
                  onHover: (point) =>
                    setHover(
                      point
                        ? [Math.floor(point.x / tileSize), Math.floor(point.y / tileSize)]
                        : null,
                    ),
                }
              : undefined
          }
        />
      </Box>
      {!readOnly && placement && (
        <Text fontSize="xs" color="cyan.300">
          {placement === 'anchor'
            ? 'Click the arrival tile.'
            : corner
              ? 'Click the opposite corner of the activation area.'
              : 'Click the first corner of the activation area.'}{' '}
          Middle/right-drag to pan.
        </Text>
      )}
      {triggerEnabled && (
        <>
          <Field label="Activation area">
            {readOnly ? (
              <Text fontSize="sm">{side.trigger?.label || side.trigger?.id}</Text>
            ) : (
              <>
                <CompactSelect
                  aria-label={`${map.name} activation area`}
                  value={existingTrigger ? side.trigger!.id : ''}
                  onChange={(event) => {
                    onChange({
                      ...side,
                      trigger: map.spatialPrimitives!.triggers!.find(
                        (item) => item.id === event.target.value,
                      )!,
                    });
                    setPlacement(null);
                    setCorner(null);
                  }}
                >
                  <option value="" disabled>
                    {side.trigger ? 'New activation area' : 'Select an existing area'}
                  </option>
                  {(map.spatialPrimitives?.triggers ?? [])
                    .filter(
                      (item) =>
                        item.type === 'locationLinkTrigger' &&
                        !map.locationLinks?.some((link) => link.triggerId === item.id),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label || item.id}
                      </option>
                    ))}
                </CompactSelect>
                <Button
                  mt={2}
                  size="xs"
                  onClick={() => {
                    setPlacement('trigger');
                    setCorner(null);
                  }}
                >
                  Draw activation area
                </Button>
              </>
            )}
          </Field>
          <Field label="Activation">
            {readOnly ? (
              <Text fontSize="sm">
                {side.linkType === 'door' ? 'Press Interact' : 'Walk into area'}
              </Text>
            ) : (
              <CompactSelect
                value={side.linkType}
                onChange={(event) =>
                  onChange({ ...side, linkType: event.target.value as ConnectionSide['linkType'] })
                }
              >
                <option value="door">Press Interact</option>
                <option value="open">Walk into area</option>
              </CompactSelect>
            )}
          </Field>
        </>
      )}
      {anchorEnabled && (
        <>
          <Field label="Arrival anchor">
            {readOnly ? (
              <Text fontSize="sm">
                {side.anchor?.name} · ({side.anchor?.position.join(', ')})
              </Text>
            ) : (
              <>
                <CompactSelect
                  aria-label={`${map.name} arrival anchor`}
                  value={existingAnchor ? side.anchor!.id : ''}
                  onChange={(event) => {
                    onChange({
                      ...side,
                      anchor: map.spatialPrimitives!.anchors!.find(
                        (item) => item.id === event.target.value,
                      )!,
                    });
                    onConfirm(false);
                    setPlacement(null);
                    setCorner(null);
                  }}
                >
                  <option value="" disabled>
                    {side.anchor ? 'New arrival anchor' : 'Select an existing anchor'}
                  </option>
                  {(map.spatialPrimitives?.anchors ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </CompactSelect>
                <Button
                  mt={2}
                  size="xs"
                  onClick={() => {
                    setPlacement('anchor');
                    setCorner(null);
                  }}
                >
                  Place new arrival anchor
                </Button>
              </>
            )}
          </Field>
          {side.anchor && (
            <>
              {!readOnly && !existingAnchor && (
                <Field label="Arrival position (pixels)">
                  <InlineNumberPair
                    labels={['X', 'Y']}
                    values={side.anchor.position}
                    min={0}
                    onChange={(position) => {
                      onChange({ ...side, anchor: { ...side.anchor!, position } });
                      onConfirm(false);
                    }}
                  />
                </Field>
              )}
              <Field label="Arrival facing">
                {readOnly || existingAnchor ? (
                  <Text fontSize="sm">
                    Direction: {facingLabel(side.anchor.facing)}
                    {existingAnchor ? ' · shared anchor, kept unchanged' : ''}
                  </Text>
                ) : (
                  <CardinalDirectionPicker
                    value={side.anchor.facing!}
                    onChange={(facing) => {
                      onChange({ ...side, anchor: { ...side.anchor!, facing } });
                      onConfirm(false);
                    }}
                  />
                )}
              </Field>
              {!readOnly && (
                <Checkbox
                  size="sm"
                  isChecked={confirmed}
                  isDisabled={!side.anchor.facing}
                  onChange={(event) => onConfirm(event.target.checked)}
                >
                  Confirm arrival position and facing
                </Checkbox>
              )}
              {!readOnly && existingAnchor && (
                <Text fontSize="xs" color="gray.400">
                  To use a different direction, place a new anchor.
                </Text>
              )}
            </>
          )}
        </>
      )}
    </VStack>
  );
}

export function LocationConnectionWizard({ initialTriggerId }: { initialTriggerId?: string }) {
  const currentMap = useEditorStore((state) => state.currentMap)!;
  const maps = useEditorStore((state) => state.maps);
  const close = useEditorStore((state) => state.closeConnectionWizard);
  const create = useEditorStore((state) => state.createLocationConnection);
  const { tileSize } = useProject();
  const [draft, setDraft] = useState<LocationConnection>(() => ({
    label: '',
    source: {
      ...newSide(currentMap.id),
      trigger:
        currentMap.spatialPrimitives?.triggers?.find((item) => item.id === initialTriggerId) ??
        null,
    },
    destination: newSide(''),
    twoWay: true,
  }));
  const [step, setStep] = useState(0);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [destinationConfirmed, setDestinationConfirmed] = useState(false);
  const [error, setError] = useState('');
  const target =
    draft.destination.mapId === currentMap.id
      ? currentMap
      : maps.find((map) => map.id === draft.destination.mapId);
  const validate = () => {
    if (!destinationConfirmed || (draft.twoWay && !sourceConfirmed))
      throw new Error('Confirm each arrival anchor and facing direction.');
    buildLocationConnection(
      maps.map((map) => (map.id === currentMap.id ? currentMap : map)),
      draft,
      tileSize,
    );
  };
  const next = () => {
    try {
      if (step === 0 && (!draft.source.trigger || !target))
        throw new Error('Choose an activation area and destination map.');
      if (step === 1) validate();
      setError('');
      setStep(step + 1);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  const side = (
    which: 'source' | 'destination',
    triggerEnabled: boolean,
    anchorEnabled: boolean,
    readOnly = false,
  ) => {
    const map = which === 'source' ? currentMap : target;
    return (
      map && (
        <SideEditor
          key={`${which}-${map.id}-${step}`}
          map={map}
          side={draft[which]}
          tileSize={tileSize}
          onChange={(value) => {
            setDraft({ ...draft, [which]: value });
            setError('');
          }}
          triggerEnabled={triggerEnabled}
          anchorEnabled={anchorEnabled}
          readOnly={readOnly}
          confirmed={which === 'source' ? sourceConfirmed : destinationConfirmed}
          onConfirm={which === 'source' ? setSourceConfirmed : setDestinationConfirmed}
        />
      )
    );
  };
  return (
    <EditorModal isOpen onClose={close} size="2xl">
      <Box
        bg="editorPanelBg"
        border="1px"
        borderColor="editorShellBorder"
        borderRadius="lg"
        maxH="90vh"
        overflowY="auto"
      >
        <ModalHeader>Connect locations · {step + 1} / 3</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Text>
              {
                [
                  'Choose the entrance and destination.',
                  'Place arrivals and confirm their facing. Add the return entrance if needed.',
                  'Review both sides before creating the connection.',
                ][step]
              }
            </Text>
            {error && (
              <Alert status="error">
                <AlertIcon />
                {error}
              </Alert>
            )}
            {step === 0 && (
              <>
                <Field label="Connection label">
                  <CompactInput
                    value={draft.label}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                    placeholder="Optional label"
                  />
                </Field>
                <Field label="Destination map">
                  <CompactSelect
                    value={draft.destination.mapId}
                    onChange={(event) => {
                      setDraft({ ...draft, destination: newSide(event.target.value) });
                      setDestinationConfirmed(false);
                    }}
                  >
                    <option value="" disabled>
                      Select a map
                    </option>
                    {maps.map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.name}
                        {map.id === currentMap.id ? ' (same map)' : ''}
                      </option>
                    ))}
                  </CompactSelect>
                </Field>
                {side('source', true, false)}
              </>
            )}
            {step === 1 && (
              <>
                <Checkbox
                  isChecked={draft.twoWay}
                  onChange={(event) => setDraft({ ...draft, twoWay: event.target.checked })}
                >
                  Also create a way back
                </Checkbox>
                <Text fontSize="xs" color="gray.400">
                  Shaded area: activation. Anchor arrow: arrival position and facing.
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {draft.twoWay && side('source', true, true)}
                  {side('destination', draft.twoWay, true)}
                </SimpleGrid>
              </>
            )}
            {step === 2 && (
              <>
                <Text fontSize="sm">
                  {currentMap.name} → {target!.name}:{' '}
                  {draft.source.linkType === 'door' ? 'Press Interact' : 'Walk into area'} →{' '}
                  {draft.destination.anchor!.name}, facing{' '}
                  {facingLabel(draft.destination.anchor!.facing)}
                </Text>
                {draft.twoWay && (
                  <Text fontSize="sm">
                    {target!.name} → {currentMap.name}:{' '}
                    {draft.destination.linkType === 'door' ? 'Press Interact' : 'Walk into area'} →{' '}
                    {draft.source.anchor!.name}, facing {facingLabel(draft.source.anchor!.facing)}
                  </Text>
                )}
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {side('source', true, draft.twoWay, true)}
                  {side('destination', draft.twoWay, true, true)}
                </SimpleGrid>
              </>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter
          position="sticky"
          bottom={0}
          bg="editorPanelBg"
          borderTop="1px"
          borderColor="editorShellBorder"
          zIndex={1}
        >
          <HStack spacing={2}>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {step > 0 && (
              <Button
                onClick={() => {
                  setStep(step - 1);
                  setError('');
                }}
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button colorScheme="cyan" onClick={next}>
                Next
              </Button>
            ) : (
              <Button
                colorScheme="cyan"
                onClick={() => {
                  try {
                    validate();
                    create(draft);
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                Create connection
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </Box>
    </EditorModal>
  );
}
