using System;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Dialogue.Vulcanus;
using Core.Location;
using Core.Tile;

namespace Core.Scripting
{
    /// <summary>Prepares the Lua modules and validates every sequence step before any action starts.</summary>
    public static class CutsceneBindings
    {
        public static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner) =>
            BindCurrentMap(definition, dialogueRunner, out _);

        internal static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner, out MapActorLuaApi actors)
        {
            if (!definition) throw new ArgumentNullException(nameof(definition));
            if (!LevelManager.Instance.SceneReady)
                throw new InvalidOperationException("Bind a cutscene after the location is SceneReady.");
            if (!MapManager.Instance.CurrentMap)
                throw new InvalidOperationException("Cutscene binding requires the initialized map.");
            var map = MapManager.Instance.CurrentMap;
            if (!StringComparer.OrdinalIgnoreCase.Equals(definition.MapId, map.MapId))
                throw new InvalidOperationException($"Cutscene '{definition.CutsceneId}' belongs to map '{definition.MapId}', not the current map '{map.MapId}'.");

            try
            {
                MapActorLuaApi actorApi = null;
                var bindings = BindSequence(definition.Steps, "cutscene",
                    (typeof(MapActorLuaApi), () => actorApi = MapActorLuaApi.BindCurrentMap()),
                    (typeof(DialogueLuaApi), () => new DialogueLuaApi(dialogueRunner, MainCharacter.CurrentMainCharacter)));
                // An endpoint can reference an actor even when no sequence action moves it.
                if (definition.OnComplete.ActorPlacements.Count > 0)
                    actorApi ??= MapActorLuaApi.BindCurrentMap();
                actors = actorApi;
                return bindings;
            }
            catch (Exception error)
            {
                throw new InvalidOperationException($"Cutscene '{definition.CutsceneId}': {error.Message}", error);
            }
        }

        /// <summary>Creates the modules a sequence uses and checks all steps without executing them.</summary>
        public static LuaBindingRegistry BindSequence(IEnumerable<CutsceneStep> steps, string context,
            params (Type Type, Func<object> Create)[] factories)
        {
            // Inspect signatures first. Creating a module can require live scene services,
            // so only create it below if this sequence actually uses one of its actions.
            var descriptions = LuaBindingRegistry.InspectTypes(factories.Select(factory => factory.Type).ToArray());
            var actions = descriptions.GetActions()
                .Where(method => method.Action.Contexts.Contains(context))
                .ToDictionary(method => method.Action.Id, StringComparer.Ordinal);
            var instances = new Dictionary<Type, object>();
            foreach (var step in steps)
            {
                try
                {
                    var method = actions[step.ActionId];
                    // Imported arguments already match this signature. Only arrange them for reflection.
                    var arguments = method.Parameters.Select(parameter => (object)step.Arguments
                        .Single(argument => argument.Name == parameter.Name).Value).ToArray();
                    var type = method.Info.DeclaringType;
                    if (!instances.TryGetValue(type, out var api))
                    {
                        api = factories.Single(factory => factory.Type == type).Create();
                        instances.Add(type, api);
                    }
                    // Only the check runs here. The action itself is called later by Lua.
                    if (method.Validator != null)
                        LuaBindingRegistry.InvokeReflected(method.Validator, api, arguments);
                }
                catch (Exception error)
                {
                    throw new InvalidOperationException($"step '{step.Id}' ({step.ActionId}): {error.Message}", error);
                }
            }
            return new LuaBindingRegistry(instances.Values.ToArray());
        }

    }
}
