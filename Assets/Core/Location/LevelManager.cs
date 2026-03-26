using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.Tile;
using Core.TimeAndWeather;
using DG.Tweening;
using Input;
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
            _locationById = _allLocations.ToDictionary(l => l.id, l => l);
        }

        void OnEnable() => this.Subscribe();
        void OnDisable() => this.Unsubscribe();

        IEnumerator Start()
        {
            var location = ResolveInitialLocation();
            if (location == null)
            {
                Debug.LogError("[LevelManager] Could not resolve an initial location from loaded scenes.");
                yield break;
            }

            SetCurrentLocation(location);
            yield return EnterLocationRoutine(location, isInitialLoad: true);
        }

        LocationData ResolveInitialLocation()
        {
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);

                if (_locationById.TryGetValue(scene.name, out var mappedLocation))
                    return mappedLocation;

                var fallbackLocation = _allLocations
                    .FirstOrDefault(l => l.sceneReference.Name == scene.name);

                if (fallbackLocation != null)
                    return fallbackLocation;
            }

            return null;
        }

        IEnumerator EnterLocationRoutine(LocationData locationData, bool isInitialLoad)
        {
            SceneReady = false;

            // Phase 1: Initialize map data (direct call, must happen before character is placed)
            MapManager.Instance.InitializeForLocation(locationData);

            // Phase 2: Spawn and place character
            var character = SpawnOrFindPlayer();
            PlaceCharacterAtSpawn(character);

            // Phase 3: Ensure character runtime initialization
            character.EnsureRuntimeInitialized();

            // Phase 4: Notify all registered lifecycle components
            foreach (var component in _lifecycleComponents)
                component.OnLocationEnter(locationData);

            // Phase 5: Fade in
            yield return Fade(0f);
            
            _transitionContext?.Clear();
            SceneReady = true;
        }

        // - API ---------------------------------------------------------------------

        public void LoadLocation(LocationData location, string entryKey, Vector2 facingDirection)
        {
            _transitionContext.Set(entryKey, facingDirection);
            StartCoroutine(LoadRoutine(location.sceneReference.Name, location));
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

        IEnumerator LoadRoutine(string sceneName, LocationData locationData)
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
            yield return EnterLocationRoutine(locationData, isInitialLoad: false);
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

        void PlaceCharacterAtSpawn(MainCharacter character)
        {
            if (!character)
            {
                Debug.LogError("[LevelManager] Could not find or spawn a MainCharacter.");
                return;
            }

            if (_transitionContext is { HasTarget: true })
            {
                var links = FindObjectsByType<LocationLink>(FindObjectsSortMode.None);
                var link = Array.Find(links, l => l.Key == _transitionContext.TargetEntryKey);
                if (link != null)
                {
                    character.transform.position = link.transform.position + link.ExitSpawnOffset;
                    var facing = link.exitFacingDirection != Vector2.zero
                        ? link.exitFacingDirection
                        : _transitionContext.FacingDirection;
                    character.Orientation.ForceDirection(facing);
                    return;
                }
            }

            var spawnPoints = FindObjectsByType<SpawnPoint>(FindObjectsSortMode.None);
            var target = _transitionContext is { HasTarget: true }
                ? Array.Find(spawnPoints, sp => sp.Key == _transitionContext.TargetEntryKey)
                : null;
            target ??= Array.Find(spawnPoints, sp => sp.Key == _defaultSpawnKey);
            target ??= spawnPoints.FirstOrDefault();

            if (target == null)
            {
                Debug.LogError($"[LevelManager] No spawn target found in '{SceneManager.GetActiveScene().name}'.");
                return;
            }

            var spawnFacing = _transitionContext != null ? _transitionContext.FacingDirection : Vector2.down;
            target.SpawnCharacter(character, spawnFacing);
        }


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