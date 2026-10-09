using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Tile;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using DG.Tweening;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Core.Location
{
    /// <summary>
    /// Handles scene loading, fading, and player spawning.
    /// Persistent singleton - survives all scene loads. References to scene-specific objects (lights etc.)
    /// are re-acquired each time a new scene loads.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public class LevelManager : Singleton<LevelManager>, IEventListener<DayLightUpdateEvent>
    {
        [Header("Initial transition preview")]
        [SerializeField] private string _initialEntryKey;
        [SerializeField] private Vector2 _initialFacingDirection;

        [SerializeField] ScreenFader _fader;
        [SerializeField] MainCharacter _mainCharacterPrefab;

        [Header("Vulcanus")] [SerializeField] VulcanusWorldCatalog _VulcanusWorldCatalog;

        [Header("Fallback spawn (editor / first run)")] [SerializeField]
        string _defaultSpawnKey = "Default";


        // - Public state ------------------------------------------------------------

        public LocationData CurrentLocationData { get; private set; }
        public Light2D CurrentGlobalLight { get; private set; }
        public bool SceneReady { get; private set; }

        // - Location lookup ---------------------------------------------------------

        List<LocationData> _allLocations = new();
        Dictionary<string, LocationData> _locationById = new();
        Dictionary<string, LocationData> _locationByScenePath = new(StringComparer.OrdinalIgnoreCase);

        // - Lifecycle callbacks ---------------------------------------------------

        private readonly List<ILocationLifecycle> _lifecycleComponents = new();
        private bool _locationEntered;

        protected override void OnAwake()
        {
            base.OnAwake();
            _allLocations = Resources.LoadAll<LocationData>("Locations").ToList();

            if (_VulcanusWorldCatalog != null)
            {
                var mappedLocations = _VulcanusWorldCatalog.GetMappedLocations();
                for (int i = 0; i < mappedLocations.Length; i++)
                {
                    var location = mappedLocations[i];
                    if (location == null || _allLocations.Contains(location))
                        continue;

                    _allLocations.Add(location);
                }
            }

            _locationById = _allLocations
                .Where(l => l != null && !string.IsNullOrWhiteSpace(l.id))
                .GroupBy(l => l.id, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
            _locationByScenePath = Core.Catalogs.IdIndex.FirstWins(_allLocations,
                location => location ? location.ScenePath : null, StringComparer.OrdinalIgnoreCase);
        }

        void OnEnable() => this.Subscribe();
        void OnDisable() => this.Unsubscribe();

        IEnumerator Start()
        {
            var location = ResolveInitialLocation();
            SetCurrentLocation(location);
            yield return EnterLocationRoutine(location, _initialEntryKey, _initialFacingDirection);
        }

        LocationData ResolveInitialLocation()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                var mappedLocation = GetLocationForScene(scene);
                if (mappedLocation != null)
                    return mappedLocation;
            }

            // No registered LocationData found — this is a manual test scene.
            // Create a transient runtime-only LocationData so the rest of the pipeline works.
            var activeScene = SceneManager.GetActiveScene();
            Debug.LogWarning(
                $"[LevelManager] No LocationData found for scene '{activeScene.name}'. Running in test mode with a transient location.");
            var testLocation = ScriptableObject.CreateInstance<LocationData>();
            testLocation.id = activeScene.name;
            testLocation.label = activeScene.name;
            return testLocation;
        }

        // Entry and facing data is passed into the location load.
        IEnumerator EnterLocationRoutine(LocationData locationData, string entryKey = null, Vector2 facingDirection = default)
        {
            SceneReady = false;

            // Initialize map data (direct call, must happen before character is placed)
            MapManager.Instance.InitializeForLocation(locationData);

            // Spawn and place character
            var character = SpawnOrFindPlayer();
            PlaceCharacterAtSpawn(character, entryKey, facingDirection);

            // Ensure character runtime initialization
            character.EnsureRuntimeInitialized();

            // A listener registered by an enter callback gets the same location immediately.
            _locationEntered = true;
            foreach (var component in _lifecycleComponents.ToArray())
                if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, locationData))
                    component.OnLocationEnter(locationData);

            // Fade in
            yield return Fade(0f);
            
            SceneReady = true;
        }

        // - API ---------------------------------------------------------------------

        public void LoadLocation(LocationData location, string entryKey, Vector2 facingDirection)
        {
            StartCoroutine(LoadRoutine(location.ScenePath, location, entryKey, facingDirection));
        }

        public bool TransitionWithinCurrentLocation(string entryKey, Vector2 facingDirection)
        {
            if (string.IsNullOrWhiteSpace(entryKey))
                return false;

            var character = SpawnOrFindPlayer();
            if (!character)
                return false;

            var placed = TryPlaceCharacterAtEntry(character, entryKey, ResolveFacingDirection(facingDirection));

            if (!placed)
            {
                Debug.LogWarning($"[LevelManager] Could not resolve local transition target '{entryKey}' in '{CurrentLocationData?.id}'.");
                return false;
            }

            character.EnsureRuntimeInitialized();
            return true;
        }

        public LocationData GetLocationDataById(string id) =>
            _locationById.GetValueOrDefault(id);

        public void RegisterLifecycle(ILocationLifecycle component)
        {
            if (_lifecycleComponents.Contains(component)) return;
            _lifecycleComponents.Add(component);
            if (_locationEntered && CanReceiveLocation(component, CurrentLocationData))
                component.OnLocationEnter(CurrentLocationData);
        }

        public void UnregisterLifecycle(ILocationLifecycle component)
        {
            _lifecycleComponents.Remove(component);
        }

        private bool CanReceiveLocation(ILocationLifecycle component, LocationData location)
        {
            if (location == null) return false;
            if (component is not MonoBehaviour behaviour) return true;
            if (!behaviour) return false;

            var sceneLocation = GetLocationForScene(behaviour.gameObject.scene);
            // Objects in a location scene only receive that location. Managers in the
            // persistent systems scene receive every location.
            return sceneLocation == null || string.Equals(sceneLocation.id, location.id, StringComparison.OrdinalIgnoreCase);
        }

        private LocationData GetLocationForScene(Scene scene)
        {
            if (_locationByScenePath.TryGetValue(scene.path, out var location)) return location;
            return _locationByScenePath.TryGetValue(scene.name, out location) ? location : null;
        }

        // - Scene load routine ------------------------------------------------------

        private static Scene GetLoadedScene(string scenePath)
        {
            var scene = SceneManager.GetSceneByPath(scenePath);
            return scene.IsValid() ? scene : SceneManager.GetSceneByName(scenePath);
        }

        IEnumerator LoadRoutine(string sceneName, LocationData locationData, string entryKey = null, Vector2 facingDirection = default)
        {
            SceneReady = false;
            MainCharacter.CurrentMainCharacter.Freeze();
            yield return Fade(1f);

            // Notify all lifecycle components before unloading the old scene
            _locationEntered = false;
            foreach (var component in _lifecycleComponents.ToArray())
                if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, CurrentLocationData))
                    component.OnLocationLeave(CurrentLocationData);

            var previousScene = SceneManager.GetActiveScene();

            yield return SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
            SceneManager.SetActiveScene(GetLoadedScene(sceneName));

            yield return SceneManager.UnloadSceneAsync(previousScene);
            yield return null; // Allow new scene's OnEnable to fire so components can register

            SetCurrentLocation(locationData);
            yield return EnterLocationRoutine(locationData, entryKey, facingDirection);
        }

        void SetCurrentLocation(LocationData locationData)
        {
            CurrentLocationData = locationData;
            CurrentGlobalLight = FindObjectsByType<Light2D>(FindObjectsSortMode.None)
                .FirstOrDefault(l => l.lightType == Light2D.LightType.Global);
        }

        // - Spawn -------------------------------------------------------------------

        MainCharacter SpawnOrFindPlayer()
        {
            var character = CharacterManager.Instance.MainCharacter;
            if (!character)
            {
                character = FindFirstObjectByType<MainCharacter>();
                if (!character)
                    character = Instantiate(_mainCharacterPrefab);
            }

            return character;
        }

        // Tries to place the character at the specified entryKey (which may be a location-link key
        // or a spawnpoint key). A blank entry key uses the configured default spawn rules.
        void PlaceCharacterAtSpawn(MainCharacter character, string entryKey = null, Vector2 facingDirection = default)
        {
            if (!character)
            {
                Debug.LogError("[LevelManager] Could not find or spawn a MainCharacter.");
                return;
            }

            var effectiveEntryKey = entryKey;
            var resolvedFacing = ResolveFacingDirection(facingDirection);

            if (TryPlaceCharacterAtEntry(character, effectiveEntryKey, resolvedFacing))
                return;

            // If no link found, try spawn points (may be multiple) matching the entry key, then default, then first
            var spawnPoints = FindObjectsByType<SpawnPoint>(FindObjectsSortMode.None);
            var target = !string.IsNullOrWhiteSpace(effectiveEntryKey)
                ? Array.Find(spawnPoints, sp => string.Equals(sp.Key, effectiveEntryKey, StringComparison.OrdinalIgnoreCase))
                : null;
            target ??= Array.Find(spawnPoints, sp => sp.Key == _defaultSpawnKey);
            target ??= spawnPoints.FirstOrDefault();

            if (target == null)
            {
                Debug.LogError($"[LevelManager] No spawn target found in '{SceneManager.GetActiveScene().name}'.");
                return;
            }

            target.SpawnCharacter(character, resolvedFacing);
        }

        bool TryPlaceCharacterAtEntry(MainCharacter character, string entryKey, Vector2 facingDirection)
        {
            if (string.IsNullOrWhiteSpace(entryKey))
                return false;

            return MapManager.Instance != null && MapManager.Instance.TryPlaceCharacterAtEntry(character, entryKey, facingDirection);
        }

        static Vector2 ResolveFacingDirection(Vector2 facingDirection) =>
            facingDirection != Vector2.zero ? facingDirection : Vector2.down;


        // - Fade --------------------------------------------------------------------

        IEnumerator Fade(float targetAlpha)
        {
            if (_fader == null)
                yield break;

            Tween tween = targetAlpha >= 1f ? _fader.FadeOut() : _fader.FadeIn();
            yield return tween.WaitForCompletion();
        }

        // - Day/night ---------------------------------------------------------------

        public void OnEvent(DayLightUpdateEvent e)
        {
            if (CurrentGlobalLight != null)
                CurrentGlobalLight.color = e.Color;
        }
    }
}
