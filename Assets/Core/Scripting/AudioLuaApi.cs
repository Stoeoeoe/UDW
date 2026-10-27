using System;
using Core.Catalogs;
using Core.Tile;
using Core.Tile.Vulcanus;
using MoreMountains.Tools;
using UnityEngine;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Audio")]
    public sealed class AudioLuaApi
    {
        private readonly MMSoundManager _manager;
        private readonly VulcanusImportedMap _map;
        private readonly SoundCatalog _sounds;

        public AudioLuaApi(MMSoundManager manager, VulcanusImportedMap map, SoundCatalog sounds)
        {
            _manager = manager ? manager : throw new InvalidOperationException("Sound actions require the initialized MMSoundManager.");
            _map = map ? map : throw new InvalidOperationException("Sound actions require the initialized map.");
            _sounds = sounds ? sounds : throw new InvalidOperationException("The required SoundCatalog is missing.");
        }

        internal static AudioLuaApi BindCurrentMap() => new(MMSoundManager.Current,
            MapManager.Instance.CurrentMap, CatalogResources.Load<SoundCatalog>(SoundCatalog.ResourceName));

        private SoundDefinition RequireSound(string sound)
        {
            var definition = _sounds.Get(sound);
            if (!definition) throw new InvalidOperationException($"Sound '{sound}' is not registered and enabled.");
            definition.RequireValidConfiguration();
            return definition;
        }

        [Preserve] public void ValidateSound(string sound, MapPosition? position)
        {
            RequireSound(sound);
            if (position.HasValue) position.Value.ToWorld(_map);
        }

        [LuaAction("audio.playSound", "Play sound", "Audio", "Play a sound globally or at a map position and continue immediately.",
            "cutscene", Validator = nameof(ValidateSound), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void PlaySound([LuaResource("sound")] string sound, [LuaPosition] MapPosition? position) =>
            Play(RequireSound(sound), position.HasValue ? position.Value.ToWorld(_map) : Vector3.zero, position.HasValue);

        private void Play(SoundDefinition sound, Vector3 location, bool spatial)
        {
            var options = MMSoundManagerPlayOptions.Default;
            options.MmSoundManagerTrack = MMSoundManager.MMSoundManagerTracks.Sfx;
            options.Location = location;
            options.SpatialBlend = spatial ? 1 : 0;
            options.Loop = false;
            _manager.PlaySound(sound.Clip, options);
        }
    }
}
