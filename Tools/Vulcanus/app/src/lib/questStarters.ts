import type { Cutscene } from '../types/cutscene';
import type { Quest, QuestStartMoment } from '../types/quest';
import type { DialogueDocument } from '../types/schema';

const START_CALL = /\bQuests\.Start\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\)/g;
const START_ACTION = 'Quests.Start';

/** IDs of the quests the Lua starts by a literal ID. A script that builds the ID cannot be found. */
export function startedQuestIds(lua: string | undefined): string[] {
  return [...(lua ?? '').matchAll(START_CALL)].map((match) => match[1] ?? match[2]);
}

/** Every quest ID started by a string or by a Quests.Start action step anywhere in the value. */
function startedIn(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') startedQuestIds(value).forEach((id) => found.add(id));
  else if (Array.isArray(value)) value.forEach((entry) => startedIn(entry, found));
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const questId = (record.arguments as Record<string, unknown> | undefined)?.questId;
    if (
      (record.action === START_ACTION || record.method === START_ACTION) &&
      typeof questId === 'string'
    )
      found.add(questId);
    Object.values(record).forEach((entry) => startedIn(entry, found));
  }
  return found;
}

export interface QuestStarter {
  kind: 'dialogue' | 'cutscene' | 'quest';
  id: string;
  name: string;
  /** The dialogue node, when that is where the quest starts. */
  nodeId?: string;
}

/** What starts the quest through a Quests.Start call: dialogue action nodes, cutscenes and other quests. */
export function questStartedBy(
  questId: string,
  content: {
    quests: readonly Quest[];
    dialogues: ReadonlyMap<string, DialogueDocument>;
    cutscenes: readonly Cutscene[];
  },
): QuestStarter[] {
  const starters: QuestStarter[] = [];
  for (const dialogue of content.dialogues.values())
    for (const node of dialogue.nodes)
      if (node.type === 'action' && startedQuestIds(node.lua).includes(questId))
        starters.push({ kind: 'dialogue', id: dialogue.id, name: dialogue.name, nodeId: node.id });
  for (const cutscene of content.cutscenes)
    if (startedIn(cutscene).has(questId))
      starters.push({ kind: 'cutscene', id: cutscene.id, name: cutscene.id });
  for (const other of content.quests)
    if (other.id !== questId && startedIn(other).has(questId))
      starters.push({ kind: 'quest', id: other.id, name: other.title });
  return starters;
}

const SEASONS = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

/** The moment in words, for the list of what starts a quest. */
export function describeStartMoment(
  moment: QuestStartMoment,
  names: Readonly<Record<string, string>> = {},
): string {
  switch (moment.on) {
    case 'gameStart':
      return 'A new game begins';
    case 'newDay':
      return 'A new day begins';
    case 'newSeason':
      return moment.season ? `${SEASONS[moment.season]} begins` : 'A new season begins';
    case 'everyTenMinutes':
      return 'Every 10 minutes';
    case 'divineFavour':
      return `Favour${moment.deity ? ` with ${names[moment.deity] ?? moment.deity}` : ''} changes${
        moment.atLeast ? ` to ${moment.atLeast} or more` : ''
      }`;
    case 'locationChanged':
      return moment.map
        ? `The player enters ${names[moment.map] ?? moment.map}`
        : 'The player enters a map';
  }
}
