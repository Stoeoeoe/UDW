using System;
using System.Linq;
using Core.Camera;
using Core.Location;
using Core.Music;
using Core.Spawning;
using Core.Tile;
using Core.TimeAndWeather;
using MoreMountains.Tools;
using VContainer;

namespace Core.Scripting
{
    /// <summary>Creates per-run Lua bindings using the game's registered services.</summary>
    public sealed class LuaRuntime
    {
        private readonly IObjectResolver _container;
        public LuaRuntime(IObjectResolver container) => _container = container;

        /// <summary>Raised after any Lua call that writes state, from dialogues, cutscenes or quest actions.</summary>
        public event Action StateWritten;
        internal void NotifyStateWritten() => StateWritten?.Invoke();
        internal LevelManager Level => _container.Resolve<LevelManager>();
        internal MapManager Maps => _container.Resolve<MapManager>();
        internal CharacterManager Characters => _container.Resolve<CharacterManager>();

        internal T Inject<T>(T api) where T : class { _container.Inject(api); return api; }

        public VulcanusLuaEngine CreateEngine(CutsceneVariables variables = null) => new(
            new LuaBindingRegistry(VulcanusLuaEngine.DefaultModules.Select(module => Inject(module.Create())).ToArray()) { Runtime = this }, variables);

        public MapActorLuaApi CreateActors() => Inject(MapActorLuaApi.BindCurrentMap(Level, Maps, _container.Resolve<WorldObjectSpawner>(), Characters.MainCharacter));
        internal AudioLuaApi CreateAudio() => new(MMSoundManager.Current, Maps.CurrentMap, _container.Resolve<SoundCatalog>());
        internal WeatherLuaApi CreateWeather() => new(_container.Resolve<WeatherManager>(), _container.Resolve<WeatherCatalog>());
        internal CameraLuaApi CreateCamera() => new(_container.Resolve<CameraManager>());
        internal MusicLuaApi CreateMusic() => Inject(new MusicLuaApi(_container.Resolve<MusicCatalog>()));
    }
}
