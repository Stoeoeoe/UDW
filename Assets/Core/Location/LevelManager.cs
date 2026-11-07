using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Character;
using Core.Catalogs;
using Core.Events;
using Core.Game;
using Core.Tile;
using Core.TimeAndWeather;
using Interaction;
using UI.Shared;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using VContainer;
using VContainer.Unity;

namespace Core.Location
{
    /// <summary>
    /// Handles scene loading, fading, and player spawning.
    /// Owned by the persistent SystemRoot. References to scene-specific objects (lights etc.)
    /// are re-acquired each time a new scene loads.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public class LevelManager : GameManager, IEventListener<DayLightUpdateEvent>
    {
        [Inject] private LocationContext _locationContext;
        [Inject] private IObjectResolver _resolver;
        [Inject] private GameState _gameState;
        [Inject] private PlayerStateManager _players;

        [Inject] private MapManager _mapManager;
        [Inject] private UrGUIManager _urGUIManager;
        [Inject] private CharacterManager _characterManager;

        [Header("Initial transition preview")]
        [SerializeField] private string _initialEntryKey;
        [SerializeField] private Vector2 _initialFacingDirection;

        [SerializeField] MainCharacter _mainCharacterPrefab;

        [Tooltip("Scene of the main menu. Starting in it waits for the menu's choice instead of entering a location.")]
        [SerializeField] private string mainMenuScenePath = "Assets/Scenes/MainMenu.unity";

        [Header("Fallback spawn (editor / first run)")] [SerializeField]
        string _defaultSpawnKey = "Default";


        // - Public state ------------------------------------------------------------

        public LocationData CurrentLocationData { get => _locationContext.Location; private set => _locationContext.Location = value; }
        public Light2D CurrentGlobalLight { get; private set; }
        public bool SceneReady { get => _locationContext.SceneReady; private set => _locationContext.SceneReady = value; }
        public event Action<LocationData> LocationReady;
        public event Action LocationLeaving;

        // - Location lookup ---------------------------------------------------------

        [Inject] private LocationCatalog _locations;
        Dictionary<string, LocationData> _locationByScenePath = new(StringComparer.OrdinalIgnoreCase);

        // - Lifecycle callbacks ---------------------------------------------------

        private readonly List<ILocationLifecycle> _lifecycleComponents = new();
        private bool _locationEntered;
        private bool _transitionInProgress;

        protected override void OnAwake()
        {
            base.OnAwake();
            _locationByScenePath = IdIndex.FirstWins(_locations.EnabledDefinitions,
                location => location ? location.ScenePath : null, StringComparer.OrdinalIgnoreCase);
        }

        protected override void OnEnable() { base.OnEnable(); this.Subscribe(); }
        protected override void OnDisable() { base.OnDisable(); this.Unsubscribe(); }

        IEnumerator Start()
        {
            // The main menu is not a location: the game begins when the menu calls BeginGame.
            if (SceneManager.GetActiveScene().path == mainMenuScenePath)
            {
                yield return null; // The UI manager binds the HUD in its own Start.
                _urGUIManager.ResetTransition(); // The screen starts covered; the menu must be visible.
                _urGUIManager.SetMainMenuActive(true);
                yield break;
            }
            yield return BeginSession(ResolveInitialLocation());
        }

        /// <summary>
        /// Enters the location of the session chosen in the main menu (a loaded save or a new game), replacing the menu scene.
        /// Does nothing while a game is already running.
        /// </summary>
        public void BeginGame()
        {
            if (SceneReady || _transitionInProgress) return;
            StartCoroutine(BeginFromMenu());
        }

        IEnumerator BeginFromMenu()
        {
            _urGUIManager.CoverSceneImmediately();
            _urGUIManager.SetMainMenuActive(false);
            yield return BeginSession(null);
        }

        // The open scene is the location the game was started in, or null when it begins from the main menu.
        IEnumerator BeginSession(LocationData open)
        {
            var saved = _gameState.Session;
            if (saved.LocationId != null)
            {
                yield return ResumeSavedLocation(open, saved);
                yield break;
            }
            if (_gameState.StartAtHome)
            {
                _gameState.StartAtHome = false;
                yield return StartAtHomeBed(open);
                yield break;
            }
            if (open == null)
                throw new InvalidOperationException("Starting from the main menu requires a loaded save or a new game.");

            SetCurrentLocation(open);
            yield return EnterLocationRoutine(open, _initialEntryKey, _initialFacingDirection);
        }

        private static bool IsOpen(LocationData open, LocationData location) =>
            open != null && string.Equals(location.id, open.id, StringComparison.OrdinalIgnoreCase);

        // A loaded save resumes where it was made. The screen is still covered from startup (ScreenFader.Awake),
        // so a different scene can replace the open one without the player seeing it.
        IEnumerator ResumeSavedLocation(LocationData open, SessionState saved)
        {
            var location = RequireSavedLocation(saved.LocationId);
            if (!IsOpen(open, location))
                yield return ReplaceActiveScene(location.ScenePath);
            yield return EnterSavedLocation(location, saved);
        }

        // A new game wakes up at the authored starting home. The screen is still covered from startup.
        IEnumerator StartAtHomeBed(LocationData open)
        {
            var home = _players.StartingHomeLocation;
            if (!IsOpen(open, home))
                yield return ReplaceActiveScene(home.ScenePath);
            SetCurrentLocation(home);
            yield return EnterLocationRoutine(home, placeCharacter: player => PlaceAtHome(player, _players.StartingBedId));
        }

        private LocationData RequireSavedLocation(string locationId) =>
            _locations.Get(locationId)
            ?? throw new InvalidOperationException($"The saved location '{locationId}' is not a registered, enabled location.");

        // Loads a fresh copy of the scene and unloads the active one, even when they are the same scene.
        private static IEnumerator ReplaceActiveScene(string scenePath)
        {
            var previous = SceneManager.GetActiveScene();
            yield return SceneManager.LoadSceneAsync(scenePath, LoadSceneMode.Additive);
            SceneManager.SetActiveScene(SceneManager.GetSceneAt(SceneManager.sceneCount - 1));
            yield return SceneManager.UnloadSceneAsync(previous);
            yield return null; // Allow the new scene's OnEnable to fire so components can register.
        }

        private IEnumerator EnterSavedLocation(LocationData location, SessionState saved)
        {
            SetCurrentLocation(location);
            yield return EnterLocationRoutine(location, placeCharacter: player =>
                MapManager.PlaceCharacterAt(player,
                    new Vector3(saved.Position.x, saved.Position.y, player.transform.position.z), saved.Facing));
        }

        /// <summary>
        /// Replaces the running game with a loaded save behind a covered screen. <paramref name="replaceState"/> swaps in the
        /// loaded state once the old player is gone; the caller has already read and validated the save.
        /// Returns false while a transition is running or the location is not ready.
        /// </summary>
        public bool ReloadGame(string savedLocationId, Action replaceState)
        {
            if (!SceneReady || _transitionInProgress) return false;
            var location = RequireSavedLocation(savedLocationId); // Fail before anything changes.
            StartCoroutine(ReloadRoutine(location, replaceState));
            return true;
        }

        private IEnumerator ReloadRoutine(LocationData location, Action replaceState)
        {
            _transitionInProgress = true;
            SceneReady = false;
            var character = _characterManager.MainCharacter;
            try
            {
                LocationLeaving?.Invoke();
                character.SetControlBlocked(this, true);
                yield return _urGUIManager.CoverScene(character.transform);

                _locationEntered = false;
                foreach (var component in _lifecycleComponents.ToArray())
                    if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, CurrentLocationData))
                        component.OnLocationLeave(CurrentLocationData);

                // The old player unbinds from the state it was bound to, so it is destroyed before the state is replaced.
                _characterManager.UnregisterMainCharacter(character);
                Destroy(character.gameObject);
                yield return null;

                replaceState();
                yield return ReplaceActiveScene(location.ScenePath);
                yield return EnterSavedLocation(location, _gameState.Session);
            }
            finally
            {
                _transitionInProgress = false;
            }
        }

        /// <summary>
        /// Leaves the running game for the main menu behind a covered screen, discarding unsaved progress. The menu then
        /// starts a session as it does at launch. Returns false while a transition is running or the location is not ready.
        /// </summary>
        public bool ReturnToMainMenu()
        {
            if (!SceneReady || _transitionInProgress) return false;
            StartCoroutine(ReturnToMainMenuRoutine());
            return true;
        }

        private IEnumerator ReturnToMainMenuRoutine()
        {
            _transitionInProgress = true;
            SceneReady = false;
            var character = _characterManager.MainCharacter;
            try
            {
                LocationLeaving?.Invoke();
                character.SetControlBlocked(this, true);
                yield return _urGUIManager.CoverScene(character.transform);

                _locationEntered = false;
                foreach (var component in _lifecycleComponents.ToArray())
                    if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, CurrentLocationData))
                        component.OnLocationLeave(CurrentLocationData);

                _characterManager.UnregisterMainCharacter(character);
                Destroy(character.gameObject);
                yield return null;

                yield return ReplaceActiveScene(mainMenuScenePath);
                _urGUIManager.ResetTransition(); // The screen is covered; the menu must be visible.
                _urGUIManager.SetMainMenuActive(true);
            }
            finally
            {
                _transitionInProgress = false;
            }
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
        IEnumerator EnterLocationRoutine(LocationData locationData, string entryKey = null, Vector2 facingDirection = default,
            bool reveal = true, Action<MainCharacter> placeCharacter = null)
        {
            SceneReady = false;

            // Initialize map data (direct call, must happen before character is placed)
            _mapManager.InitializeForLocation(locationData);

            // Spawn and place character
            var character = GetOrSpawnPlayer();
            if (placeCharacter == null) PlaceCharacterAtSpawn(character, entryKey, facingDirection);

            // Ensure character runtime initialization
            character.EnsureRuntimeInitialized();

            // A listener registered by an enter callback gets the same location immediately.
            _locationEntered = true;
            foreach (var component in _lifecycleComponents.ToArray())
                if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, locationData))
                    component.OnLocationEnter(locationData);

            // Custom placement runs after location listeners restore persistent objects, including the home bed.
            placeCharacter?.Invoke(character);
            if (reveal) yield return _urGUIManager.RevealScene(character.transform);
            
            SceneReady = true;
            LocationReady?.Invoke(locationData);
        }

        // - API ---------------------------------------------------------------------

        public bool LoadLocation(LocationData location, string entryKey, Vector2 facingDirection)
        {
            if (!SceneReady || _transitionInProgress) return false;
            StartCoroutine(LoadRoutine(location.ScenePath, location, entryKey, facingDirection));
            return true;
        }

        /// <summary>Loads and initializes a location without fading; the caller owns the covered screen and final placement.</summary>
        public IEnumerator LoadLocationCovered(LocationData location, Action<MainCharacter> placeCharacter) =>
            LoadRoutine(location.ScenePath, location, covered: true, placeCharacter: placeCharacter);

        /// <summary>Returns to the saved home behind an already-covered screen, awaiting location initialization and bed placement.</summary>
        public IEnumerator ReturnHome(MainCharacter character)
        {
            var home = _gameState.Player.Home;
            if (CurrentLocationData.id == home.LocationId)
                PlaceAtHome(character, home.BedId);
            else
                yield return LoadLocationCovered(GetLocationDataById(home.LocationId),
                    player => PlaceAtHome(player, home.BedId));
        }

        private static void PlaceAtHome(MainCharacter character, string bedId)
        {
            // Exactly one live bed must have this authored identity. Missing or duplicate beds are broken content.
            var bed = FindObjectsByType<Bed>(FindObjectsSortMode.None).Single(b => b.PersistentId == bedId);
            bed.PlaceCharacter(character);
        }

        public bool TransitionWithinCurrentLocation(string entryKey, Vector2 facingDirection)
        {
            if (!SceneReady || _transitionInProgress) return false;
            if (string.IsNullOrWhiteSpace(entryKey))
                return false;

            var character = GetOrSpawnPlayer();
            if (!character)
                return false;

            var placed = TryPlaceCharacterAtEntry(character, entryKey, ResolveFacingDirection(facingDirection));

            if (!placed)
                throw new InvalidOperationException($"[LevelManager] Missing entry '{entryKey}' in '{CurrentLocationData.id}'.");

            character.EnsureRuntimeInitialized();
            return true;
        }

        public LocationData GetLocationDataById(string id) =>
            _locations.Get(id);

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

        IEnumerator LoadRoutine(string sceneName, LocationData locationData, string entryKey = null, Vector2 facingDirection = default,
            bool covered = false, Action<MainCharacter> placeCharacter = null)
        {
            if (!SceneReady || _transitionInProgress)
                throw new InvalidOperationException("Cannot load a location while the current location is not ready or a transition is running.");
            _transitionInProgress = true;
            SceneReady = false;
            var character = _characterManager.MainCharacter;
            try
            {
                // Cancel staging before any listener captures departing world-object positions.
                LocationLeaving?.Invoke();
                character.SetControlBlocked(this, true);
                if (!covered) yield return _urGUIManager.CoverScene(character.transform);

                // Notify all lifecycle components before unloading the old scene
                _locationEntered = false;
                foreach (var component in _lifecycleComponents.ToArray())
                    if (_lifecycleComponents.Contains(component) && CanReceiveLocation(component, CurrentLocationData))
                        component.OnLocationLeave(CurrentLocationData);

                var previousScene = SceneManager.GetActiveScene();

                // Location changes retain the player; the overnight caller also keeps this character through its reveal.
                character.transform.SetParent(null, true);
                DontDestroyOnLoad(character.gameObject);

                yield return SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
                SceneManager.SetActiveScene(GetLoadedScene(sceneName));

                yield return SceneManager.UnloadSceneAsync(previousScene);
                yield return null; // Allow new scene's OnEnable to fire so components can register

                SetCurrentLocation(locationData);
                yield return EnterLocationRoutine(locationData, entryKey, facingDirection, !covered, placeCharacter);
            }
            finally
            {
                _transitionInProgress = false;
                if (character) character.SetControlBlocked(this, false);
            }
        }

        void SetCurrentLocation(LocationData locationData)
        {
            CurrentLocationData = locationData;
            CurrentGlobalLight = FindObjectsByType<Light2D>(FindObjectsSortMode.None)
                .FirstOrDefault(l => l.lightType == Light2D.LightType.Global);
        }

        // - Spawn -------------------------------------------------------------------

        /// <summary>The player is spawned once from the prefab and registered immediately, before location listeners run.</summary>
        MainCharacter GetOrSpawnPlayer()
        {
            var character = _characterManager.MainCharacter;
            if (character) return character;
            character = _resolver.Instantiate(_mainCharacterPrefab);
            _characterManager.RegisterMainCharacter(character);
            return character;
        }

        // Explicit entries must resolve to an anchor or matching test spawn point.
        // Only a blank entry key uses the initial/default spawn rules.
        void PlaceCharacterAtSpawn(MainCharacter character, string entryKey = null, Vector2 facingDirection = default)
        {
            if (!character)
                throw new InvalidOperationException("[LevelManager] Could not find or spawn a MainCharacter.");

            var resolvedFacing = ResolveFacingDirection(facingDirection);

            if (TryPlaceCharacterAtEntry(character, entryKey, resolvedFacing))
                return;

            // Without an explicit entry the authored debug spawn point wins over the legacy test SpawnPoint.
            if (string.IsNullOrWhiteSpace(entryKey) && _mapManager.TryPlaceCharacterAtDebugSpawn(character, resolvedFacing))
                return;

            var spawnPoints = FindObjectsByType<SpawnPoint>(FindObjectsSortMode.None);
            var target = !string.IsNullOrWhiteSpace(entryKey)
                ? Array.Find(spawnPoints, sp => string.Equals(sp.Key, entryKey, StringComparison.OrdinalIgnoreCase))
                : null;
            if (!string.IsNullOrWhiteSpace(entryKey) && target == null)
                throw new InvalidOperationException($"[LevelManager] Missing entry '{entryKey}' in '{CurrentLocationData.id}'.");
            if (string.IsNullOrWhiteSpace(entryKey))
            {
                target = Array.Find(spawnPoints, sp => sp.Key == _defaultSpawnKey);
                target ??= spawnPoints.FirstOrDefault();
            }

            if (target == null)
                throw new InvalidOperationException($"[LevelManager] No spawn target found in '{SceneManager.GetActiveScene().name}'.");

            target.SpawnCharacter(character, resolvedFacing);
        }

        bool TryPlaceCharacterAtEntry(MainCharacter character, string entryKey, Vector2 facingDirection)
        {
            if (string.IsNullOrWhiteSpace(entryKey))
                return false;

            return _mapManager.TryPlaceCharacterAtEntry(character, entryKey, facingDirection);
        }

        static Vector2 ResolveFacingDirection(Vector2 facingDirection) =>
            facingDirection != Vector2.zero ? facingDirection : Vector2.down;


        // - Day/night ---------------------------------------------------------------

        public void OnEvent(DayLightUpdateEvent e)
        {
            if (CurrentGlobalLight != null)
                CurrentGlobalLight.color = e.Color;
        }
    }
}
