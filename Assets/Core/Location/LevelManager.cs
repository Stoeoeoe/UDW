using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Tile;
using Core.Tile.Vulcan;
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
    public class LevelManager : Singleton<LevelManager>, IEventListener<DayLightUpdateEvent>
    {
        [Header("Transition")] [SerializeField]
        private TransitionContext _transitionContext;

        [SerializeField] ScreenFader _fader;
        [SerializeField] MainCharacter _mainCharacterPrefab;

        [Header("Vulcan")] [SerializeField] VulcanWorldCatalog _vulcanWorldCatalog;

        [Header("Fallback spawn (editor / first run)")] [SerializeField]
        string _defaultSpawnKey = "Default";


        // - Public state ------------------------------------------------------------

        public LocationData CurrentLocationData { get; private set; }
        public Light2D CurrentGlobalLight { get; private set; }
        public bool SceneReady { get; private set; }

        // - Location lookup ---------------------------------------------------------

        List<LocationData> _allLocations = new();
        Dictionary<string, LocationData> _locationById = new();

        // - Lifecycle callbacks ---------------------------------------------------

        private readonly List<ILocationLifecycle> _lifecycleComponents = new();

        protected override void OnAwake()
        {
            base.OnAwake();
            _allLocations = Resources.LoadAll<LocationData>("Locations").ToList();

            if (_vulcanWorldCatalog != null)
            {
                var mappedLocations = _vulcanWorldCatalog.GetMappedLocations();
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
        }

        void OnEnable() => this.Subscribe();
        void OnDisable() => this.Unsubscribe();

        IEnumerator Start()
        {
            var location = ResolveInitialLocation();
            SetCurrentLocation(location);
            // If transition context already has a target (e.g. editor preview), prefer it for the initial load
            var initialEntryKey = _transitionContext != null && _transitionContext.HasTarget ? _transitionContext.TargetEntryKey : null;
            var initialFacing = _transitionContext != null ? _transitionContext.FacingDirection : Vector2.zero;
            yield return EnterLocationRoutine(location, isInitialLoad: true, initialEntryKey, initialFacing);
        }

        LocationData ResolveInitialLocation()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (_locationById.TryGetValue(scene.name, out var mappedLocation))
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

        // Now accepts an explicit entryKey and facingDirection so callers can tell the loader
        // which entry to place the player at. If entryKey is null/empty, falls back to _transitionContext.
        IEnumerator EnterLocationRoutine(LocationData locationData, bool isInitialLoad, string entryKey = null, Vector2 facingDirection = default)
        {
            SceneReady = false;

            // Initialize map data (direct call, must happen before character is placed)
            MapManager.Instance.InitializeForLocation(locationData);

            // Spawn and place character
            var character = SpawnOrFindPlayer();
            PlaceCharacterAtSpawn(character, entryKey, facingDirection);

            // Ensure character runtime initialization
            character.EnsureRuntimeInitialized();

            // Notify all registered lifecycle components
            foreach (var component in _lifecycleComponents)
                component.OnLocationEnter(locationData);

            // Fade in
            yield return Fade(0f);
            
            _transitionContext?.Clear();
            SceneReady = true;
        }

        // - API ---------------------------------------------------------------------

        public void LoadLocation(LocationData location, string entryKey, Vector2 facingDirection)
        {
            _transitionContext?.Set(entryKey, facingDirection);
            StartCoroutine(LoadRoutine(location.id, location, entryKey, facingDirection));
        }

        public bool TransitionWithinCurrentLocation(string entryKey, Vector2 facingDirection)
        {
            if (string.IsNullOrWhiteSpace(entryKey))
                return false;

            var character = SpawnOrFindPlayer();
            if (!character)
                return false;

            _transitionContext?.Set(entryKey, facingDirection);
            var placed = TryPlaceCharacterAtEntry(character, entryKey, ResolveFacingDirection(facingDirection));
            _transitionContext?.Clear();

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
            if (!_lifecycleComponents.Contains(component))
            {
                _lifecycleComponents.Add(component);
            }
        }

        public void UnregisterLifecycle(ILocationLifecycle component)
        {
            _lifecycleComponents.Remove(component);
        }

        // - Scene load routine ------------------------------------------------------

        IEnumerator LoadRoutine(string sceneName, LocationData locationData, string entryKey = null, Vector2 facingDirection = default)
        {
            SceneReady = false;
            MainCharacter.CurrentMainCharacter.Freeze();
            yield return Fade(1f);

            // Notify all lifecycle components before unloading the old scene
            foreach (var component in _lifecycleComponents)
            {
                component.OnLocationLeave(CurrentLocationData);
            }

            var previousScene = SceneManager.GetActiveScene();

            yield return SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
            SceneManager.SetActiveScene(SceneManager.GetSceneByName(sceneName));

            yield return SceneManager.UnloadSceneAsync(previousScene);
            yield return null; // Allow new scene's OnEnable to fire so components can register

            SetCurrentLocation(locationData);
            yield return EnterLocationRoutine(locationData, isInitialLoad: false, entryKey, facingDirection);
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
        // or a spawnpoint key). If entryKey is null/blank, falls back to the transition context
        // and then to default spawn rules.
        void PlaceCharacterAtSpawn(MainCharacter character, string entryKey = null, Vector2 facingDirection = default)
        {
            if (!character)
            {
                Debug.LogError("[LevelManager] Could not find or spawn a MainCharacter.");
                return;
            }

            // Prefer explicit entryKey provided to the loader; otherwise fall back to transition context
            var effectiveEntryKey = !string.IsNullOrWhiteSpace(entryKey) ? entryKey
                : (_transitionContext != null && _transitionContext.HasTarget ? _transitionContext.TargetEntryKey : null);
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

        Vector2 ResolveFacingDirection(Vector2 facingDirection) =>
            facingDirection != Vector2.zero ? facingDirection : (_transitionContext != null ? _transitionContext.FacingDirection : Vector2.down);


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