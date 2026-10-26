using System;
using System.Collections.Generic;
using System.Globalization;
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
        // Export reads these factory types without invoking them. Playback supplies the live dependencies.
        internal static (Type Type, Func<object> Create)[] ActionModules(VulcanusDialogueRunner dialogueRunner,
            Action<MapActorLuaApi> bindActors) => new[]
        {
            VulcanusLuaEngine.Module(() =>
            {
                var characters = MapActorLuaApi.BindCurrentMap();
                bindActors(characters);
                return characters;
            }),
            VulcanusLuaEngine.Module(() => new DialogueLuaApi(dialogueRunner, MainCharacter.CurrentMainCharacter)),
            VulcanusLuaEngine.Module(CameraLuaApi.BindCurrentCamera)
        };

        public static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner) =>
            BindCurrentMap(definition, dialogueRunner, out _);

        internal static LuaBindingRegistry BindCurrentMap(CutsceneDefinition definition,
            VulcanusDialogueRunner dialogueRunner, out MapActorLuaApi characters)
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
                var steps = definition.OnStart.Select(step => ("setup", step))
                    .Concat(definition.Steps.Select(step => ("sequence", step)))
                    .Concat(definition.OnComplete.Steps.Select(step => ("completion", step)));
                var bindings = BindSteps(steps, "cutscene", VulcanusLuaEngine.Modules(dialogueRunner, characters => actorApi = characters));
                // An endpoint can reference a character even when no sequence action moves it.
                if (definition.OnComplete.CharacterPlacements.Count > 0)
                    actorApi ??= MapActorLuaApi.BindCurrentMap();
                characters = actorApi;
                return bindings;
            }
            catch (Exception error)
            {
                throw new InvalidOperationException($"Cutscene '{definition.CutsceneId}': {error.Message}", error);
            }
        }

        /// <summary>Creates the modules a sequence uses and checks all steps without executing them.</summary>
        public static LuaBindingRegistry BindSequence(IEnumerable<CutsceneStep> steps, string context,
            params (Type Type, Func<object> Create)[] factories) =>
            BindSteps(steps.Select(step => ("sequence", step)), context, factories);

        private static LuaBindingRegistry BindSteps(IEnumerable<(string Phase, CutsceneStep Step)> steps, string context,
            params (Type Type, Func<object> Create)[] factories)
        {
            // Inspect signatures first. Creating a module can require live scene services,
            // so only create it below if this sequence actually uses one of its actions.
            var descriptions = LuaBindingRegistry.InspectTypes(factories.Select(factory => factory.Type).ToArray());
            var actions = descriptions.GetActions()
                .Where(method => method.Action.Contexts.Contains(context))
                .ToDictionary(method => method.Action.Id, StringComparer.Ordinal);
            var instances = new Dictionary<Type, object>();
            foreach (var (phase, step) in steps)
            {
                try
                {
                    var method = actions[step.ActionId];
                    if (!method.Action.Phases.Contains(phase))
                        throw new InvalidOperationException($"Action '{step.ActionId}' is not allowed in phase '{phase}'.");
                    // Imported arguments already match this signature. Only arrange them for reflection.
                    var arguments = method.Parameters.Select(parameter =>
                    {
                        if (parameter.IsOptional && !step.Arguments.Any(argument => argument.Name == parameter.Name))
                            return parameter.DefaultValue;
                        var argument = step.Arguments.Single(argument => argument.Name == parameter.Name);
                        if (parameter.ParameterType == typeof(string)) return (object)argument.Value;
                        if (parameter.ParameterType == typeof(double)) return double.Parse(argument.Value, CultureInfo.InvariantCulture);
                        if (parameter.ParameterType == typeof(bool)) return bool.Parse(argument.Value);
                        if (parameter.ParameterType == typeof(MapPosition)) return argument.Position;
                        if (parameter.ParameterType == typeof(MapPath)) return argument.Path;
                        throw new InvalidOperationException($"Unsupported sequence parameter type '{parameter.ParameterType}'.");
                    }).ToArray();
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
                    throw new InvalidOperationException($"{phase}, step '{step.Id}' ({step.ActionId}): {error.Message}", error);
                }
            }
            return new LuaBindingRegistry(instances.Values.ToArray());
        }

    }
}
