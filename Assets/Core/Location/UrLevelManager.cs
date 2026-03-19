using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Core.TimeAndWeather;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Core.Location
{
    public class UrLevelManager : LevelManager, MMEventListener<DayLightUpdateEvent>
    {
        private Dictionary<string, LocationData> _locationSceneNameMap = new();

        private List<LocationData> _locationDataList = new();

        // private readonly Dictionary<string, MainCharacter> _players = new();
        public LocationData CurrentLocationData { get; private set; }
        public Light2D CurrentGlobalLight { get; private set; }
        public Dictionary<string, LocationLink> LocationLinks { get; set; } = new();
        public string TargetLocationLinkKey { get; set; }

        /// <summary>
        /// Mainly for testing
        /// </summary>
        [SerializeField] protected CheckPoint InitialSpawnPoint;

        public string CurrentTargetEntry { get; set; }

        protected override void Awake()
        {
            base.Awake();
            if (SceneCharacters.Count == 0 && !InitialSpawnPoint)
            {
                InitialSpawnPoint = FindFirstObjectByType<CheckPoint>();
            }

            _locationDataList = Resources.LoadAll<LocationData>("Locations").ToList();
            _locationSceneNameMap = _locationDataList.ToDictionary(loc => loc.sceneReference.Name, loc => loc);
        }

        protected override void Start()
        {
            // Get first scene with location data
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!_locationSceneNameMap.TryGetValue(scene.name, out var locationData)) continue;
                SetCurrentLocation(locationData);
                break;
            }

            base.Start();
        }

        public void SetCurrentLocation(LocationData locationData)
        {
            CurrentLocationData = locationData;
            var lights = FindObjectsByType<Light2D>(FindObjectsSortMode.None);
            CurrentGlobalLight = lights.FirstOrDefault(l => l.lightType == Light2D.LightType.Global);
            // TODO: Event
        }

        public void OnMMEvent(DayLightUpdateEvent dayLightUpdateEvent)
        {
            UpdateGlobalLight(dayLightUpdateEvent.Color);
        }

        private void UpdateGlobalLight(Color color)
        {
            if (CurrentGlobalLight == null) return;
            CurrentGlobalLight.color = color;
        }

        public LocationData GetLocationDataById(string locationId)
        {
            return _locationDataList.FirstOrDefault(loc => loc.id == locationId);
        }

        protected override IEnumerator GotoLevelCo(string levelName)
        {
            yield return base.GotoLevelCo(levelName);
            TopDownEngineEvent.Trigger(TopDownEngineEventTypes.LevelStart,
                null); // TODO: Check why this isn't fired by the TDE level manager already?  
        }

        protected override void SpawnSingleCharacter()
        {
            // If we have a target location link key (e.g. door), we try to spawn at that location link
            if (TargetLocationLinkKey != null)
            {
                if (LocationLinks.TryGetValue(TargetLocationLinkKey, out var locationLink))
                {
                    Players[0].RespawnAt(transform, locationLink.ExitFacingDirection);
                    TopDownEngineEvent.Trigger(TopDownEngineEventTypes.SpawnComplete, Players[0]);
                    TargetLocationLinkKey = null;
                    return;
                }
            }

            /// If it wasn't set, probably it's the first spawn or a reload. We try to get point of entry from GameManager.

            PointsOfEntryStorage point = GameManager.Instance.GetPointsOfEntry(SceneManager.GetActiveScene().name);
            if ((point != null) && (PointsOfEntry.Length >= (point.PointOfEntryIndex + 1)))
            {
                Players[0].RespawnAt(PointsOfEntry[point.PointOfEntryIndex], point.FacingDirection);
                TopDownEngineEvent.Trigger(TopDownEngineEventTypes.SpawnComplete, Players[0]);
                return;
            }

            if (InitialSpawnPoint != null)
            {
                InitialSpawnPoint.SpawnPlayer(Players[0]);
                TopDownEngineEvent.Trigger(TopDownEngineEventTypes.SpawnComplete, Players[0]);
                return;
            }
        }


        protected override void OnEnable()
        {
            base.OnEnable();
            this.MMEventStartListening<DayLightUpdateEvent>();
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            this.MMEventStopListening<DayLightUpdateEvent>();
        }

        public override void OnMMEvent(TopDownEngineEvent engineEvent)
        {
            base.OnMMEvent(engineEvent);
            if (engineEvent.EventType == TopDownEngineEventTypes.LevelStart)
            {
                InitialSpawnPoint = FindFirstObjectByType<CheckPoint>();
                LocationLinks = FindObjectsByType<LocationLink>(FindObjectsSortMode.None)
                    .ToDictionary(l => l.Key, l => l);
            }
        }


        // TODO: Deregister?
        // public void RegisterPlayerCharacter(MainCharacter character)
        // {
        //     this._players[character.PlayerID] = character;
        //     MainCharacterChangedEvent.Trigger(character);
        // }

        // public MainCharacter GetPlayerById(string playerId)
        // {
        //     return this._players.GetValueOrDefault(playerId);
        // }
    }
}