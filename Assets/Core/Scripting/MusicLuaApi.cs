using Core.Catalogs;
using System;
using Core.Music;
using UnityEngine.Scripting;
using VContainer;
using Preserve = UnityEngine.Scripting.PreserveAttribute;

namespace Core.Scripting
{
    [LuaModule("Music")]
    public sealed class MusicLuaApi
    {
        [Inject] private CutsceneRunner _cutsceneRunner;
        [Inject] private MusicDirector _musicDirector;

        private readonly DefinitionCatalog _catalog;
        public MusicLuaApi(DefinitionCatalog catalog) => _catalog = catalog ? catalog : throw new InvalidOperationException("DefinitionCatalog is required.");
        [Preserve]
        public void ValidateOverride(string cue, string preset, string quantization = "NextBar", double fadeSeconds = 1)
        {
            var definition = RequireCue(cue);
            definition.Preset(preset);
            Quantization(quantization);
            if (!double.IsFinite(fadeSeconds) || fadeSeconds < 0) throw new ArgumentOutOfRangeException(nameof(fadeSeconds));
        }
        private MusicCue RequireCue(string id) => _catalog.Get<MusicCue>(id) ?? throw new InvalidOperationException($"Music cue '{id}' is not registered and enabled.");
        private static MusicQuantization Quantization(string value) =>
            Enum.TryParse<MusicQuantization>(value, false, out var result) && Enum.IsDefined(typeof(MusicQuantization), result)
                ? result : throw new ArgumentException("Use Immediate, NextBeat or NextBar.");

        [LuaAction("music.override", "Override music", "Music", "Override environmental music until this cutscene finishes or releases it.",
            "cutscene", Validator = nameof(ValidateOverride), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Override([LuaResource("musicCue")] string cue, string preset, string quantization = "NextBar", double fadeSeconds = 1)
        {
            var run = _cutsceneRunner.ActiveRun ?? throw new InvalidOperationException("Music overrides require a live cutscene run.");
            var director = _musicDirector;
            var next = director.Requests.Request(RequireCue(cue), preset, 1000, Quantization(quantization), fadeSeconds);
            run.MusicOverride?.Dispose(); run.MusicOverride = next;
        }
        [LuaAction("music.release", "Release music", "Music", "Return to current environmental music.",
            "cutscene", Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Release()
        {
            var run = _cutsceneRunner.ActiveRun ?? throw new InvalidOperationException("Music release requires a live cutscene run.");
            run.MusicOverride?.Dispose(); run.MusicOverride = null;
        }
    }
}
