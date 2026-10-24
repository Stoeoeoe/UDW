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
            BindCurrentMap(definition, dialogueRunner, out _, out _);

        internal static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner, out MapActorLuaApi actors,
            out CutsceneLuaApi cutscene)
        {
            if (!definition) throw new ArgumentNullException(nameof(definition));
            definition.RequireValidConfiguration();
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
                var cutsceneApi = new CutsceneLuaApi(definition.Completion.Outcome);
                var bindings = BindSequence(definition.Steps, "cutscene",
                    (typeof(MapActorLuaApi), () => actorApi = MapActorLuaApi.BindCurrentMap()),
                    (typeof(DialogueLuaApi), () => new DialogueLuaApi(dialogueRunner, MainCharacter.CurrentMainCharacter)),
                    (typeof(CutsceneLuaApi), () => cutsceneApi));
                // An endpoint can reference an actor even when no sequence action moves it.
                if (definition.Completion.ActorOutcomes.Count > 0)
                    actorApi ??= MapActorLuaApi.BindCurrentMap();
                actors = actorApi;
                cutscene = cutsceneApi;
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
                .ToDictionary(method => method.Action.Id, StringComparer.Ordinal);
            var instances = new Dictionary<Type, object>();
            foreach (var step in steps)
            {
                try
                {
                    if (!actions.TryGetValue(step.ActionId, out var method) ||
                        !method.Action.Contexts.Contains(context))
                        throw new InvalidOperationException($"Unsupported {context} action '{step.ActionId}'.");
                    var arguments = ReadStepArguments(step, method);
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

        private static object[] ReadStepArguments(CutsceneStep step, LuaBindingRegistry.Method method)
        {
            var arguments = step.Arguments.ToDictionary(argument => argument.Name, argument => argument.Value, StringComparer.Ordinal);
            if (arguments.Count != method.Parameters.Length || method.Parameters.Any(parameter => !arguments.ContainsKey(parameter.Name)))
                throw new InvalidOperationException($"Expected named arguments: {string.Join(", ", method.Parameters.Select(parameter => parameter.Name))}.");
            // The sequence format supports string references. Handwritten Lua has the wider primitive API.
            if (method.Parameters.Any(parameter => parameter.ParameterType != typeof(string)) ||
                arguments.Values.Any(string.IsNullOrWhiteSpace))
                throw new InvalidOperationException("Sequence arguments must be non-empty strings.");
            // Authored arguments are named; reflection expects the C# parameter order.
            return method.Parameters.Select(parameter => (object)arguments[parameter.Name]).ToArray();
        }
    }
}
