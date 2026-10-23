using System;
using Character;
using Core.Dialogue.Vulcanus;
using Core.Location;
using Core.Tile;

namespace Core.Scripting
{
    /// <summary>Checks a cutscene's references against the loaded map before any action starts.</summary>
    public static class CutsceneBindings
    {
        public static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner, float movementTimeoutSeconds)
        {
            if (!definition) throw new ArgumentNullException(nameof(definition));
            definition.RequireValidConfiguration();
            if (!LevelManager.Instance || !LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Bind a cutscene after the location is SceneReady.");
            if (!MapManager.Instance || !MapManager.Instance.CurrentMap)
                throw new InvalidOperationException("Cutscene binding requires the initialized map.");
            var map = MapManager.Instance.CurrentMap;
            if (!StringComparer.OrdinalIgnoreCase.Equals(definition.MapId, map.MapId))
                throw new InvalidOperationException($"Cutscene '{definition.CutsceneId}' belongs to map '{definition.MapId}', not the current map '{map.MapId}'.");

            try
            {
                return LuaBindingRegistry.BindSequence(definition.Steps, "cutscene",
                    (typeof(MapActorLuaApi), () => MapActorLuaApi.BindCurrentMap(movementTimeoutSeconds)),
                    (typeof(DialogueLuaApi), () => new DialogueLuaApi(dialogueRunner, MainCharacter.CurrentMainCharacter)));
            }
            catch (Exception error)
            {
                throw new InvalidOperationException($"Cutscene '{definition.CutsceneId}': {error.Message}", error);
            }
        }
    }
}
