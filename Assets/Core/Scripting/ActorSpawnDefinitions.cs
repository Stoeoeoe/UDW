using System;
using System.Collections.Generic;
using Character;
using Core.Spawning;

namespace Core.Scripting
{
    /// <summary>Resolves character definitions through the game's already registered spawnable prefabs.</summary>
    public static class ActorSpawnDefinitions
    {
        public static IReadOnlyDictionary<string, SpawnedObject> Find(IEnumerable<SpawnedObject> prefabs)
        {
            var result = new Dictionary<string, SpawnedObject>(StringComparer.Ordinal);
            foreach (var prefab in prefabs)
            {
                var characters = prefab.GetComponentsInChildren<GameCharacter>(true);
                if (characters.Length == 0) continue; // Chests and other non-character spawnables remain valid.
                if (characters.Length != 1 || characters[0] is MainCharacter)
                    throw new InvalidOperationException($"Character spawnable '{prefab.name}' requires exactly one NPC character; the player uses its existing role.");
                var character = characters[0];
                character.ValidateConfiguration();
                if (CharacterCatalog.Require(character.CharacterId) != character.Definition)
                    throw new InvalidOperationException($"Spawnable '{prefab.name}' must reference its registered character definition.");
                for (var node = character.transform; node != prefab.transform.parent; node = node.parent)
                    if (!node.gameObject.activeSelf)
                        throw new InvalidOperationException($"Character spawnable '{prefab.name}' requires active character ancestry within the prefab.");
                if (!character.enabled || !result.TryAdd(character.CharacterId, prefab))
                    throw new InvalidOperationException($"Character '{character.CharacterId}' requires one enabled character and a unique spawnable prefab.");
            }
            return result;
        }
    }
}
