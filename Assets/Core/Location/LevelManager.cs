using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Events;
using Core.TimeAndWeather;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Core.Location
{
    /// <summary>
    /// Handles scene loading, fading, and player spawning. 
    /// Persistent singleton — survives all scene loads. References to scene-specific objects (lights etc.)
    /// are re-acquired each time a new scene loads.
    /// </summary>
    public class LevelManager : PersistentSingleton<LevelManager>, IEventListener<DayLightUpdateEvent>
    {
        [Header("Transition")]
        [SerializeField] TransitionContext _transitionContext;
        [SerializeField] CanvasGroup _fadeCanvas;
        [SerializeField] float _fadeDuration = 0.3f;
        [SerializeField] MainCharacter _mainCharacterPrefab;

        [Header("Fallback spawn (editor / first run)")]
        [SerializeField] string _defaultSpawnKey = "Default";

        // ── Public state ─────────────────────────────────────────────────────────────

        public LocationData CurrentLocationData { get; private set; }
        public Light2D      CurrentGlobalLight  { get; private set; }

        // ── Location lookup ───────────────────────────────────────────────────────────

        List<LocationData> _allLocations = new();
        Dictionary<string, LocationData> _locationById = new();

        protected override void OnAwake()
        {
            base.OnAwake();
            _allLocations  = Resources.LoadAll<LocationData>("Locations").ToList();
            _locationById  = _allLocations.ToDictionary(l => l.id, l => l);
        }

        void OnEnable()  => this.Subscribe<DayLightUpdateEvent>();
        void OnDisable() => this.Unsubscribe<DayLightUpdateEvent>();

        void Start()
        {
            var location = ResolveInitialLocation();
    
            if (location != null)
            {
                SetCurrentLocation(location);
            }
            HandleInitialSpawn();
            SceneReadyEvent.Trigger(location);
        }

        private LocationData ResolveInitialLocation()
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

        private void HandleInitialSpawn()
        {
            // First-run spawn — no transition context
            if (_transitionContext == null || !_transitionContext.HasTarget)
            {
                SpawnPlayer();
            }
        }

        // ── API ───────────────────────────────────────────────────────────────────────

        public void LoadLocation(LocationData location, string entryKey, Vector2 facingDirection)
        {
            _transitionContext.Set(entryKey, facingDirection);
            StartCoroutine(LoadRoutine(location.sceneReference.Name, location));
        }

        public LocationData GetLocationDataById(string id) =>
            _locationById.GetValueOrDefault(id);

        // ── Scene load routine ────────────────────────────────────────────────────────

        IEnumerator LoadRoutine(string sceneName, LocationData locationData)
        {
            yield return Fade(1f);

            var previousScene = SceneManager.GetActiveScene();
            yield return SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
            SceneManager.SetActiveScene(SceneManager.GetSceneByName(sceneName));
            SceneUnloadingEvent.Trigger(CurrentLocationData);
            yield return SceneManager.UnloadSceneAsync(previousScene); // destroys old scene + player
            yield return null; // let cleanup finish

            SetCurrentLocation(locationData);
            SpawnPlayer();
            SceneReadyEvent.Trigger(locationData);

            yield return Fade(0f);
            _transitionContext.Clear();
        }

        void SetCurrentLocation(LocationData locationData)
        {
            CurrentLocationData = locationData;
            CurrentGlobalLight  = FindObjectsByType<Light2D>(FindObjectsSortMode.None)
                                      .FirstOrDefault(l => l.lightType == Light2D.LightType.Global);
        }

        // ── Spawn ─────────────────────────────────────────────────────────────────────

        void SpawnPlayer()
        {
            var character = CharacterManager.Instance.MainCharacter;
            // If we haven't yet registered a main character (e.g. first scene's Start runs before the character's Start),
            // we first try to find one in the scene, and if that fails, we instantiate a new one from the prefab.
            if (!character)
            {
                character = FindFirstObjectByType<MainCharacter>();
                if (!character)
                {
                    character = Instantiate(_mainCharacterPrefab);
                }
            } 

            // LocationLink transition: spawn at the matching link in the new scene
            if (_transitionContext is { HasTarget: true })
            {
                var links = FindObjectsByType<LocationLink>(FindObjectsSortMode.None);
                var link  = Array.Find(links, l => l.Key == _transitionContext.TargetEntryKey);
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

            // Fallback: SpawnPoint (editor testing / first boot / no matching link)
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

        // ── Fade ──────────────────────────────────────────────────────────────────────

        IEnumerator Fade(float targetAlpha)
        {
            if (_fadeCanvas == null) yield break;

            float start   = _fadeCanvas.alpha;
            float elapsed = 0f;
            while (elapsed < _fadeDuration)
            {
                elapsed += Time.unscaledDeltaTime;
                _fadeCanvas.alpha = Mathf.Lerp(start, targetAlpha, elapsed / _fadeDuration);
                yield return null;
            }
            _fadeCanvas.alpha = targetAlpha;
        }

        // ── Day/night ─────────────────────────────────────────────────────────────────

        public void OnEvent(DayLightUpdateEvent e)
        {
            if (CurrentGlobalLight != null)
                CurrentGlobalLight.color = e.Color;
        }
    }
}
