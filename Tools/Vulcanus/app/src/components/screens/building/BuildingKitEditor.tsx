import { useMemo, useState } from 'react';
import { Box, Button, HStack, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { FiFolder, FiPlus, FiX } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { useResolvedKitsStore } from '../../../store/useResolvedKitsStore';
import { KIT_LAYOUT, type KitPieceGroup } from '../../../lib/buildings/kitLayout';
import { chooseKitSheet } from '../../../lib/buildings/kitSheets';
import { LOCAL_ID_PATTERN } from '../../../lib/resourceIds';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { InspectorShell } from '../../common/InspectorShell';
import { CompactInput, CompactSelect, Field } from '../../common/Fields';
import { SectionLabel } from '../../common/Typography';
import { GhostIconButton } from '../../common/IconButtons';
import { KitPieceCanvas } from './KitPieceCanvas';
import type { BuildingKit } from '../../../types/building';

const GROUPS: { group: KitPieceGroup; label: string }[] = [
  { group: 'roof', label: 'Roof' },
  { group: 'wall', label: 'Front wall' },
  { group: 'opening', label: 'Doors and windows' },
  { group: 'overlay', label: 'Overlays' },
  { group: 'interior-wall', label: 'Interior walls' },
  { group: 'interior-opening', label: 'Interior doors and windows' },
  { group: 'floor', label: 'Floors' },
  { group: 'wall-cap', label: 'Wall tops' },
];

export function BuildingKitEditor({ kitId }: { kitId: string }) {
  const kit = useEditorStore((state) => state.buildingKits.find((entry) => entry.id === kitId));
  return kit ? <KitWorkspace key={kitId} kit={kit} /> : <Text p={6}>Kit not found.</Text>;
}

function KitWorkspace({ kit }: { kit: BuildingKit }) {
  const update = useEditorStore((state) => state.updateBuildingKit);
  const projectPath = useEditorStore((state) => state.projectPath);
  const resolved = useResolvedKitsStore((state) => state.kits[kit.id]);
  const [variation, setVariation] = useState<string | null>(null);
  const ready = resolved?.status === 'ready' ? resolved.kit : null;
  const shownVariation = variation && ready?.variationIds.includes(variation) ? variation : null;

  const choose = async () => (projectPath ? chooseKitSheet(projectPath) : null);
  const setVariations = (variations: Record<string, string>) =>
    update(kit.id, { variations: Object.keys(variations).length ? variations : undefined });
  const variations = kit.variations ?? {};

  const pieces = useMemo(
    () =>
      GROUPS.map(({ group, label }) => ({
        label,
        slots: KIT_LAYOUT.filter((slot) => slot.group === group && ready?.pieces.has(slot.name)),
      })).filter((entry) => entry.slots.length),
    [ready],
  );

  const content = (
    <VStack align="stretch" spacing={5} p={6} h="full" overflowY="auto" bg="editorCanvasBg">
      <HStack>
        <Text fontSize="sm" color="editorMutedText">
          Variation
        </Text>
        <CompactSelect
          aria-label="Variation"
          w="auto"
          value={shownVariation ?? ''}
          onChange={(e) => setVariation(e.target.value || null)}
        >
          <option value="">Base</option>
          {ready?.variationIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </CompactSelect>
      </HStack>
      {!resolved || resolved.status === 'loading' ? (
        <Text color="editorMutedText">Reading the kit…</Text>
      ) : resolved.status === 'error' ? (
        <Text role="alert" color="editorDangerText">
          {resolved.error}
        </Text>
      ) : (
        pieces.map(({ label, slots }) => (
          <VStack key={label} align="stretch" spacing={2}>
            <SectionLabel>{label}</SectionLabel>
            <Wrap spacing={3}>
              {slots.map((slot) => (
                <WrapItem key={slot.name}>
                  <VStack spacing={1}>
                    <KitPieceCanvas
                      piece={ready!.pieces.get(slot.name)!}
                      variation={shownVariation}
                    />
                    <Text fontSize="2xs" fontFamily="mono" color="editorMutedText">
                      {slot.name}
                    </Text>
                  </VStack>
                </WrapItem>
              ))}
            </Wrap>
          </VStack>
        ))
      )}
    </VStack>
  );

  const inspector = (
    <InspectorShell title="Kit" subtitle={kit.id}>
      <Field label="Name">
        <CompactInput value={kit.name} onChange={(e) => update(kit.id, { name: e.target.value })} />
      </Field>
      <Field label="Base sheet" helperText="A PNG or Aseprite file in the standard kit layout.">
        <HStack>
          <Text fontSize="xs" fontFamily="mono" flex={1} noOfLines={1} title={kit.source}>
            {kit.source || 'None chosen'}
          </Text>
          <Button
            size="xs"
            leftIcon={<FiFolder />}
            onClick={async () => {
              const source = await choose();
              if (source) update(kit.id, { source });
            }}
          >
            Choose…
          </Button>
        </HStack>
      </Field>
      <VStack align="stretch" spacing={2}>
        <SectionLabel>Variations</SectionLabel>
        {Object.entries(variations).map(([id, path]) => (
          <VariationRow
            key={id}
            id={id}
            path={path}
            taken={Object.keys(variations)}
            onRename={(next) =>
              setVariations(
                Object.fromEntries(
                  Object.entries(variations).map(([key, value]) => [
                    key === id ? next : key,
                    value,
                  ]),
                ),
              )
            }
            onChoose={async () => {
              const sheet = await choose();
              if (sheet) setVariations({ ...variations, [id]: sheet });
            }}
            onRemove={() =>
              setVariations(
                Object.fromEntries(Object.entries(variations).filter(([key]) => key !== id)),
              )
            }
          />
        ))}
        <Button
          size="xs"
          leftIcon={<FiPlus />}
          alignSelf="flex-start"
          onClick={async () => {
            const sheet = await choose();
            if (!sheet) return;
            let index = 1;
            while (`variation-${index}` in variations) index++;
            setVariations({ ...variations, [`variation-${index}`]: sheet });
          }}
        >
          Add variation…
        </Button>
      </VStack>
      {ready && (ready.empty.length > 0 || ready.problems.length > 0) && (
        <VStack align="stretch" spacing={1}>
          <SectionLabel>Problems</SectionLabel>
          {ready.problems.map((problem) => (
            <Text key={problem} role="alert" fontSize="xs" color="editorDangerText">
              {problem}
            </Text>
          ))}
          {ready.empty.length > 0 && (
            <Text role="alert" fontSize="xs" color="editorDangerText">
              Nothing drawn for: {ready.empty.join(', ')}.
            </Text>
          )}
        </VStack>
      )}
    </InspectorShell>
  );

  return (
    <ResizableEditorLayout
      viewportBackground={false}
      rightPanel={inspector}
      rightPanelDefaultSize={30}
      rightPanelMinSize={22}
      content={content}
    />
  );
}

function VariationRow({
  id,
  path,
  taken,
  onRename,
  onChoose,
  onRemove,
}: {
  id: string;
  path: string;
  taken: string[];
  onRename: (id: string) => void;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(id);
  const valid = LOCAL_ID_PATTERN.test(draft) && (draft === id || !taken.includes(draft));
  return (
    <Box borderWidth="1px" borderColor="editorBorderSubtle" borderRadius="md" p={2}>
      <VStack align="stretch" spacing={1}>
        <HStack>
          <CompactInput
            aria-label={`Variation ${id} ID`}
            value={draft}
            isInvalid={!valid}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => (valid && draft !== id ? onRename(draft) : setDraft(id))}
          />
          <GhostIconButton
            aria-label={`Remove variation ${id}`}
            icon={<FiX />}
            size="xs"
            onClick={onRemove}
          />
        </HStack>
        <HStack>
          <Text fontSize="xs" fontFamily="mono" flex={1} noOfLines={1} title={path}>
            {path}
          </Text>
          <Button size="xs" leftIcon={<FiFolder />} onClick={onChoose}>
            Choose…
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}
