import React, { useEffect, useState } from 'react';
import { Box, Button, Input, Select, Switch, Text, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Field, InspectorSection, ReadOnlyIdField } from '../../common/Fields';
import { MapPositionField } from '../../common/MapPositionField';
import { MapPreviewPicker } from '../../common/MapPreviewPicker';
import { completionPosition, completionPlacement } from '../../../lib/cutscenes';
import { type MapPosition, type PlacementMode } from '../../../lib/mapPosition';
import {
  DEFAULT_CUTSCENE_TRANSITION,
  type Cutscene,
  type CompletionFacing,
} from '../../../types/cutscene';
import { CutsceneVariablesEditor } from './CutsceneVariableFields';

export function CutsceneSettings({
  scene,
  mode,
  characterOptions,
}: {
  scene: Cutscene;
  mode: 'scene' | 'completion';
  characterOptions: { id: string; label: string }[];
}) {
  const maps = useEditorStore((s) => s.maps);
  const currentMap = useEditorStore((s) => s.currentMap);
  const labels = useEditorStore((s) => s.cutsceneLabels);
  const edit = useEditorStore((s) => s.editCutscenes);
  const map = currentMap?.id === scene.mapId ? currentMap : maps.find((m) => m.id === scene.mapId);
  const anchorOptions = (map?.spatialPrimitives?.anchors ?? []).map((anchor) => ({
    id: anchor.id,
    label: anchor.name || anchor.id,
  }));
  const [endpointCharacter, setEndpointCharacter] = useState('');
  const [endpointPicking, setEndpointPicking] = useState<{
    index: number;
    character: string;
    mapId: string;
    mode: PlacementMode;
  } | null>(null);
  const [hoverPosition, setHoverPosition] = useState<MapPosition | null>(null);
  const cancelPicking = () => {
    setEndpointPicking(null);
    setHoverPosition(null);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelPicking();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  useEffect(() => {
    setEndpointPicking(null);
    setHoverPosition(null);
  }, [scene.mapId, mode]);
  useEffect(() => {
    if (
      endpointPicking &&
      scene.onComplete.characterPlacements[endpointPicking.index]?.character !==
        endpointPicking.character
    ) {
      setEndpointPicking(null);
      setHoverPosition(null);
    }
  }, [endpointPicking, scene.onComplete.characterPlacements]);
  const update = (change: (draft: Cutscene) => void) =>
    edit((scenes) => change(scenes.find((s) => s.id === scene.id)!));
  const sceneFields = (
    <>
      <CutsceneVariablesEditor
        variables={scene.variables ?? []}
        onChange={(variables) =>
          update((draft) => {
            draft.variables = variables;
          })
        }
      />
      <Field label="Name">
        <Input
          value={labels[scene.id] ?? ''}
          onChange={(e) =>
            edit((_draft, draftLabels) => {
              draftLabels[scene.id] = e.target.value;
            })
          }
        />
      </Field>
      <Field label="Map">
        <ReferenceSelect
          value={scene.mapId}
          options={maps.map((m) => ({ id: m.id, label: m.name }))}
          onChange={(mapId) =>
            update((draft) => {
              draft.mapId = mapId;
            })
          }
        />
      </Field>
      <Field
        label="Allow skipping"
        helperText="Skipping applies the same final positions and completion actions. Disable it when the player must make a dialogue choice."
      >
        <Switch
          isChecked={scene.allowSkip}
          onChange={(e) =>
            update((draft) => {
              draft.allowSkip = e.target.checked;
            })
          }
        />
      </Field>
      <Field
        label="Show transition"
        helperText="Fade to black, hold, then open from the center at both ends. Shared timings are configured in Unity's CutscenePresentation settings asset."
      >
        <Switch
          aria-label="Show transition"
          isChecked={(scene.transition ?? DEFAULT_CUTSCENE_TRANSITION).enabled}
          onChange={(e) =>
            update((draft) => {
              draft.transition = {
                ...(draft.transition ?? DEFAULT_CUTSCENE_TRANSITION),
                enabled: e.target.checked,
              };
            })
          }
        />
      </Field>
      <Box as="details">
        <Box as="summary" textStyle="helperText" cursor="pointer" mb={3}>
          Resource details
        </Box>
        <Field label="ID">
          <ReadOnlyIdField value={scene.id} />
        </Field>
      </Box>
    </>
  );
  const completionFields = (
    <>
      <InspectorSection title="Final character positions">
        <Text textStyle="helperText">
          Placements apply before completion steps, both after watching and skipping. Other
          characters restore their original positions. Facing is kept unless a final facing or
          anchor direction overrides it.
        </Text>
        {scene.onComplete.characterPlacements.map((placement, index) => (
          <VStack
            key={index}
            align="stretch"
            spacing={2}
            bg="editorInlineBg"
            p={3}
            borderRadius="md"
          >
            <Field label="Character">
              <ReferenceSelect
                value={placement.character}
                options={characterOptions}
                onChange={(character) => {
                  cancelPicking();
                  update((draft) => {
                    draft.onComplete.characterPlacements[index].character = character;
                  });
                }}
              />
            </Field>
            <Field label="Final position">
              <MapPositionField
                value={completionPosition(placement)}
                modes={['tile', 'pixel', 'anchor']}
                anchors={anchorOptions}
                isPicking={endpointPicking?.index === index}
                onChange={(position) =>
                  update((draft) => {
                    draft.onComplete.characterPlacements[index] = completionPlacement(
                      placement.character,
                      position,
                      placement.facing,
                    );
                  })
                }
                onPick={(mode) => {
                  cancelPicking();
                  setEndpointPicking({
                    index,
                    character: placement.character,
                    mapId: scene.mapId,
                    mode,
                  });
                }}
                onModeChange={(mode) => {
                  if (mode === 'anchor') cancelPicking();
                  else if (endpointPicking?.index === index) {
                    setHoverPosition(null);
                    setEndpointPicking({ ...endpointPicking, mode });
                  }
                }}
                onCancel={cancelPicking}
              />
            </Field>
            <Field label="Final facing">
              <Select
                aria-label="Final facing"
                value={placement.facing ?? (placement.anchor !== undefined ? 'anchor' : 'preserve')}
                onChange={(e) =>
                  update((draft) => {
                    const endpoint = draft.onComplete.characterPlacements[index];
                    if (e.target.value === 'anchor') delete endpoint.facing;
                    else endpoint.facing = e.target.value as CompletionFacing;
                  })
                }
              >
                <option value="preserve">Keep current facing</option>
                {placement.anchor !== undefined && (
                  <option value="anchor">Use anchor facing</option>
                )}
                {(['North', 'East', 'South', 'West'] as const).map((direction) => (
                  <option key={direction} value={direction}>
                    {direction}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                cancelPicking();
                update((draft) => {
                  draft.onComplete.characterPlacements.splice(index, 1);
                });
              }}
            >
              Restore original
            </Button>
          </VStack>
        ))}
        <Select
          aria-label="New endpoint character"
          placeholder="Add character…"
          value={endpointCharacter}
          onChange={(e) => setEndpointCharacter(e.target.value)}
        >
          {characterOptions
            .filter((a) => !scene.onComplete.characterPlacements.some((p) => p.character === a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.id}
              </option>
            ))}
        </Select>
        <Button
          size="xs"
          isDisabled={!endpointCharacter}
          onClick={() => {
            update((draft) => {
              draft.onComplete.characterPlacements.push({
                character: endpointCharacter,
                anchor: '',
              });
            });
            setEndpointCharacter('');
          }}
        >
          Specify final position
        </Button>
      </InspectorSection>
    </>
  );

  const activePick = endpointPicking?.mapId === scene.mapId ? endpointPicking : null;
  const tileSize = useEditorStore((s) => s.project?.tileSize ?? 16);
  return (
    <VStack align="stretch" spacing={4}>
      {mode === 'scene' ? sceneFields : completionFields}
      {activePick &&
        (map ? (
          <Box h="410px">
            <MapPreviewPicker
              mapId={map.id}
              width={600}
              height={360}
              leftDragPan
              positionPick={{
                mode: activePick.mode,
                onHover: setHoverPosition,
                onPick: (position) => {
                  update((draft) => {
                    const previous = draft.onComplete.characterPlacements[activePick.index];
                    draft.onComplete.characterPlacements[activePick.index] = completionPlacement(
                      activePick.character,
                      position,
                      previous.facing,
                    );
                  });
                  cancelPicking();
                },
              }}
              overlays={
                hoverPosition
                  ? [
                      {
                        kind: 'placement',
                        position: [hoverPosition.x / tileSize, hoverPosition.y / tileSize],
                        label: activePick.character,
                      },
                    ]
                  : []
              }
            />
          </Box>
        ) : (
          <Text color="editorDangerText">Select the cutscene map before placing a character.</Text>
        ))}
    </VStack>
  );
}
const ReferenceSelect: React.FC<{
  value: string;
  options: { id: string; label: string; disabled?: boolean; note?: string }[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <Select value={value} placeholder="Select…" onChange={(e) => onChange(e.target.value)}>
    {value && !options.some((o) => o.id === value) && (
      <option value={value}>Missing: {value}</option>
    )}
    {options.map((option) => (
      <option key={option.id} value={option.id} disabled={option.disabled}>
        {option.label} · {option.id}
        {option.note ? ` (${option.note})` : ''}
      </option>
    ))}
  </Select>
);
