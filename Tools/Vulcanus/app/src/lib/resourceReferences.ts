import type { EditorResourceTypeId } from '../types/editorResource';
import type { Character, DialogueDocument, Shop } from '../types/schema';
import type { Quest } from '../types/quest';
import type { Routine } from '../types/routine';

/** One resource pointing at another, such as a quest objective naming a character. */
export interface ResourceReference {
  from: ResourceKey;
  to: ResourceKey;
  /** What the pointer is, for example "Objective: Talk to Fabia". */
  via: string;
}

export interface ResourceKey {
  type: EditorResourceTypeId;
  id: string;
}

/** The resources whose references are known. Add a type here and an extractor below to include it. */
export interface ReferenceSources {
  characters: readonly Character[];
  quests: readonly Quest[];
  routines: readonly Routine[];
  dialogues: readonly DialogueDocument[];
  shops: readonly Shop[];
}

type Link = Pick<ResourceReference, 'to' | 'via'>;
const link = (type: EditorResourceTypeId, id: string | null | undefined, via: string): Link[] =>
  id ? [{ to: { type, id }, via }] : [];

const fromCharacter = (character: Character): Link[] =>
  (character.dialogues ?? []).flatMap((entry, index) =>
    link('dialogue', entry.dialogue, `Dialogue ${index + 1}`),
  );

const fromQuest = (quest: Quest): Link[] => [
  ...link('character', quest.giver, 'Giver'),
  ...quest.steps.flatMap((step) =>
    step.objectives.flatMap((objective): Link[] => {
      const via = `Objective: ${objective.text}`;
      switch (objective.kind) {
        case 'talk':
          return [
            ...link('character', objective.character, via),
            ...link('dialogue', objective.dialogue, via),
          ];
        case 'deliver':
          return [
            ...link('character', objective.character, via),
            ...link('item', objective.item, via),
            ...link('dialogue', objective.dialogue, via),
          ];
        case 'have':
          return link('item', objective.item, via);
        case 'reach':
          return link('location', objective.map, via);
        default:
          return [];
      }
    }),
  ),
];

const fromRoutine = (routine: Routine): Link[] => {
  const goals = [...(routine.overrides ?? []), ...routine.variants].flatMap((entry) =>
    [entry, ...(entry.pickOne ?? [])].flatMap((day) => day.goals ?? []),
  );
  return [
    ...link('character', routine.character, 'Character'),
    ...link('location', routine.home.map, 'Home'),
    ...link('dialogue', routine.dialogue, 'Start of the day'),
    ...goals.flatMap((goal) => [
      ...link('dialogue', goal.walkingDialogue, `Goal ${goal.id} (walking)`),
      ...link('dialogue', goal.dialogue, `Goal ${goal.id}`),
      ...(goal.destination === 'home'
        ? []
        : link('location', goal.destination.map, `Goal ${goal.id}`)),
    ]),
  ];
};

const fromDialogue = (dialogue: DialogueDocument): Link[] =>
  dialogue.nodes.flatMap((node): Link[] => {
    if (node.type === 'line') return link('character', node.speaker, 'Speaker');
    if (node.type === 'jump') return link('dialogue', node.targetDialogueId, 'Jump');
    return [];
  });

const fromShop = (shop: Shop): Link[] =>
  shop.offerings.flatMap((offering) => link('item', offering.itemId, 'Sells'));

/** Every reference between the known resources, without duplicates. */
export function allReferences(sources: ReferenceSources): ResourceReference[] {
  const found: ResourceReference[] = [];
  const seen = new Set<string>();
  const collect = <T extends { id: string }>(
    type: EditorResourceTypeId,
    resources: readonly T[],
    extract: (resource: T) => Link[],
  ) => {
    for (const resource of resources)
      for (const { to, via } of extract(resource)) {
        const key = JSON.stringify([type, resource.id, to.type, to.id, via]);
        if (seen.has(key) || (to.type === type && to.id === resource.id)) continue;
        seen.add(key);
        found.push({ from: { type, id: resource.id }, to, via });
      }
  };
  collect('character', sources.characters, fromCharacter);
  collect('quest', sources.quests, fromQuest);
  collect('routine', sources.routines, fromRoutine);
  collect('dialogue', sources.dialogues, fromDialogue);
  collect('shop', sources.shops, fromShop);
  return found;
}

const same = (a: ResourceKey, b: ResourceKey) => a.type === b.type && a.id === b.id;

/** What the resource points at. */
export const usesOf = (references: readonly ResourceReference[], resource: ResourceKey) =>
  references.filter((reference) => same(reference.from, resource));

/** What points at the resource. */
export const usedBy = (references: readonly ResourceReference[], resource: ResourceKey) =>
  references.filter((reference) => same(reference.to, resource));
