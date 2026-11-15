import { Badge, HStack } from '@chakra-ui/react';
import { startedQuestIds } from '../../../lib/questStarters';
import { useEditorStore } from '../../../store/useEditorStore';

/** Marks a dialogue action that starts a quest, so it is clear from the dialogue where the quest begins. */
export function StartsQuestBadges({ lua }: { lua: string | undefined }) {
  const quests = useEditorStore((s) => s.quests);
  const ids = [...new Set(startedQuestIds(lua))];
  if (!ids.length) return null;
  return (
    <HStack spacing={1} mt={1} flexWrap="wrap">
      {ids.map((id) => {
        const quest = quests.find((q) => q.id === id);
        return (
          <Badge key={id} colorScheme={quest ? 'purple' : 'red'} fontSize="9px">
            {quest ? `Starts quest: ${quest.title}` : `Starts unknown quest: ${id}`}
          </Badge>
        );
      })}
    </HStack>
  );
}
