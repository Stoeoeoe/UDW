import { useState } from 'react';
import { Checkbox, HStack, Text, VStack } from '@chakra-ui/react';
import type { Building, BuildingKit, BuildingRoofKind } from '../../../types/building';
import { floorName, floorPlan, withFloor } from '../../../lib/buildings/plan';
import type { ResolvedKit } from '../../../lib/buildings/resolveKit';
import type { PlanIssue } from '../../../lib/buildings/validate';
import { openingRefusal, resize } from '../../../lib/buildings/edit';
import { LOCAL_ID_PATTERN } from '../../../lib/resourceIds';
import { InspectorShell } from '../../common/InspectorShell';
import { CompactInput, CompactSelect, Field, ReadOnlyIdField } from '../../common/Fields';
import { SectionLabel } from '../../common/Typography';
import { KitPieceCanvas } from './KitPieceCanvas';
import type { PlanSelection } from './PlanCanvas';

/** A text field that commits on blur, and only a valid value; an invalid one goes back to the current value. */
function CommitField({
  label,
  value,
  isValid,
  onCommit,
  type = 'text',
}: {
  label: string;
  value: string;
  isValid: (draft: string) => boolean;
  onCommit: (value: string) => void;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => (isValid(draft) && draft !== value ? onCommit(draft) : setDraft(value));
  return (
    <Field label={label}>
      <CompactInput
        aria-label={label}
        type={type}
        value={draft}
        isInvalid={!isValid(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Field>
  );
}

const localId = (taken: string[], current: string) => (draft: string) =>
  LOCAL_ID_PATTERN.test(draft) && (draft === current || !taken.includes(draft));

const ROOF_KINDS: { kind: BuildingRoofKind; label: string }[] = [
  { kind: 'side-gable', label: 'Side gable' },
  { kind: 'front-gable', label: 'Front gable' },
  { kind: 'cross-gable', label: 'Cross gable (over the entrance room)' },
];

export function BuildingInspector({
  building,
  floor,
  kits,
  kit,
  issues,
  selection,
  defaultFloor,
  onChange,
  onSelect,
}: {
  building: Building;
  floor: number;
  kits: readonly BuildingKit[];
  kit: ResolvedKit | null;
  issues: PlanIssue[];
  selection: PlanSelection;
  defaultFloor: string;
  onChange: (building: Building) => void;
  onSelect: (selection: PlanSelection) => void;
}) {
  const plan = floorPlan(building, floor);
  const changePlan = (changes: Partial<typeof plan>) =>
    onChange(withFloor(building, floor, { ...plan, ...changes }));
  const room =
    selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined;
  const opening =
    selection?.kind === 'opening' ? plan.openings.find((o) => o.id === selection.id) : undefined;
  const chimney = selection?.kind === 'chimney' ? building.chimney : undefined;

  const resizeTo = (width: number, depth: number) => {
    const result = resize(building, width, depth, defaultFloor);
    if (
      result.removed.length &&
      !confirm(`Resizing removes ${result.removed.join(', ')}. Continue?`)
    )
      return;
    onChange(result.building);
    onSelect(null);
  };
  const size = (min: number) => (draft: string) =>
    Number.isInteger(Number(draft)) && Number(draft) >= min;

  const problems = issues.length ? (
    <VStack align="stretch" spacing={1}>
      <SectionLabel>Problems</SectionLabel>
      {issues.map((issue) => (
        <Text key={issue.message} role="alert" fontSize="xs" color="editorDangerText">
          {issue.message}
        </Text>
      ))}
    </VStack>
  ) : null;

  if (room) {
    const floors = kit?.floors.includes(room.floor)
      ? kit.floors
      : [room.floor, ...(kit?.floors ?? [])];
    const setRoom = (changes: Partial<typeof room>) =>
      changePlan({
        rooms: plan.rooms.map((entry) => (entry.id === room.id ? { ...entry, ...changes } : entry)),
      });
    return (
      <InspectorShell title="Room" subtitle={`${floorName(floor)} · ${room.id}`}>
        <CommitField
          label="Name"
          value={room.name}
          isValid={(d) => !!d.trim()}
          onCommit={(name) => setRoom({ name })}
        />
        <CommitField
          label="Room ID"
          value={room.id}
          isValid={localId(
            plan.rooms.map((r) => r.id),
            room.id,
          )}
          onCommit={(id) => {
            setRoom({ id });
            onSelect({ kind: 'room', id });
          }}
        />
        <Field label="Floor">
          <HStack>
            <CompactSelect
              aria-label="Floor"
              value={room.floor}
              onChange={(e) => setRoom({ floor: e.target.value })}
            >
              {floors.map((floor) => (
                <option key={floor} value={floor}>
                  {floor}
                </option>
              ))}
            </CompactSelect>
            {kit?.pieces.get(room.floor) && (
              <KitPieceCanvas piece={kit.pieces.get(room.floor)!} variation={null} scale={2} />
            )}
          </HStack>
        </Field>
        {problems}
      </InspectorShell>
    );
  }

  if (opening) {
    const others = { ...plan, openings: plan.openings.filter((o) => o.id !== opening.id) };
    const setOpening = (changes: Partial<typeof opening>) =>
      changePlan({
        openings: plan.openings.map((entry) =>
          entry.id === opening.id ? { ...entry, ...changes } : entry,
        ),
      });
    return (
      <InspectorShell
        title={opening.kind === 'door' ? 'Door' : 'Window'}
        subtitle={opening.id}
        onDelete={() => {
          changePlan({ openings: others.openings });
          onSelect(null);
        }}
        deleteLabel={`Delete ${opening.kind}`}
      >
        <Field label="Kind">
          <CompactSelect
            aria-label="Kind"
            value={opening.kind}
            onChange={(e) => setOpening({ kind: e.target.value as typeof opening.kind })}
          >
            {(['door', 'window'] as const).map((kind) => (
              <option
                key={kind}
                value={kind}
                disabled={!!openingRefusal(others, kind, opening.x, opening.y, floor === 0)}
              >
                {kind}
              </option>
            ))}
          </CompactSelect>
        </Field>
        <CommitField
          label="Opening ID"
          value={opening.id}
          isValid={localId(
            plan.openings.map((o) => o.id),
            opening.id,
          )}
          onCommit={(id) => {
            setOpening({ id });
            onSelect({ kind: 'opening', id });
          }}
        />
        <Field label="Cell">
          <ReadOnlyIdField value={`(${opening.x}, ${opening.y})`} />
        </Field>
        {problems}
      </InspectorShell>
    );
  }

  if (chimney) {
    return (
      <InspectorShell
        title="Chimney"
        subtitle={`Column ${chimney.column}`}
        onDelete={() => {
          onChange({ ...building, chimney: undefined });
          onSelect(null);
        }}
        deleteLabel="Remove chimney"
      >
        <Text fontSize="sm" color="editorMutedText">
          Choose the Chimney tool and click another column to move it.
        </Text>
        {problems}
      </InspectorShell>
    );
  }

  return (
    <InspectorShell title="Building" subtitle={building.id}>
      <CommitField
        label="Name"
        value={building.name}
        isValid={(d) => !!d.trim()}
        onCommit={(name) => onChange({ ...building, name })}
      />
      <Field label="Kit">
        <CompactSelect
          aria-label="Kit"
          value={building.kit}
          onChange={(e) => onChange({ ...building, kit: e.target.value })}
        >
          <option value="">Choose a kit…</option>
          {kits.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </CompactSelect>
      </Field>
      <HStack align="flex-start">
        <CommitField
          label="Width"
          type="number"
          value={String(building.width)}
          isValid={size(3)}
          onCommit={(width) => resizeTo(Number(width), building.depth)}
        />
        <CommitField
          label="Depth"
          type="number"
          value={String(building.depth)}
          isValid={size(5)}
          onCommit={(depth) => resizeTo(building.width, Number(depth))}
        />
      </HStack>
      <Field label="Roof">
        <CompactSelect
          aria-label="Roof"
          value={building.roof.kind}
          onChange={(e) =>
            onChange({ ...building, roof: { kind: e.target.value as BuildingRoofKind } })
          }
        >
          {ROOF_KINDS.map((entry) => (
            <option key={entry.kind} value={entry.kind}>
              {entry.label}
            </option>
          ))}
        </CompactSelect>
      </Field>
      <Field label="Inside width">
        <CompactSelect
          aria-label="Inside width"
          value={building.scale}
          onChange={(e) => onChange({ ...building, scale: Number(e.target.value) as 1 | 2 })}
        >
          <option value={1}>As wide as the front</option>
          <option value={2}>Twice as wide as the front</option>
        </CompactSelect>
      </Field>
      <Checkbox
        size="sm"
        isChecked={!!building.chimney}
        onChange={(e) =>
          onChange({
            ...building,
            chimney: e.target.checked ? { column: Math.floor(building.width / 2) } : undefined,
          })
        }
      >
        Chimney
      </Checkbox>
      {problems}
    </InspectorShell>
  );
}
