using System;
using System.Collections.Generic;
using Character;
using Core.Location;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>One start attempt per player visit, including a player already inside when the map becomes ready.</summary>
    [DefaultExecutionOrder(400)]
    [RequireComponent(typeof(Collider2D))]
    public sealed class CutsceneTrigger : MonoBehaviour
    {
        [SerializeField] private string cutsceneId;
        private Collider2D _area;
        private LevelManager _level;
        private readonly HashSet<Collider2D> _playerColliders = new();
        private bool _attempted;
        public string CutsceneId => cutsceneId;

#if UNITY_EDITOR
        public void Configure(string id) => cutsceneId = id;
#endif

        private void Awake()
        {
            if (string.IsNullOrWhiteSpace(cutsceneId)) throw new InvalidOperationException("A cutscene trigger requires its permanent cutscene ID.");
            _area = GetComponent<Collider2D>();
            if (!_area.isTrigger) throw new InvalidOperationException("A cutscene trigger requires a trigger collider.");
            CutsceneRunner.Instance.Resolve(cutsceneId); // Broken bindings fail before a player enters the area.
        }

        private void OnEnable()
        {
            _level = LevelManager.Instance;
            _level.LocationReady += OnReady;
            if (_level.SceneReady) CheckInitialOverlap();
        }

        private void OnDisable()
        {
            _level.LocationReady -= OnReady;
            _playerColliders.Clear();
            _attempted = false;
        }

        private void OnReady(LocationData location) => CheckInitialOverlap();

        private void CheckInitialOverlap()
        {
            // Entry placement may have changed transforms since the last physics step.
            Physics2D.SyncTransforms();
            var overlaps = new List<Collider2D>();
            _area.Overlap(new ContactFilter2D().NoFilter(), overlaps);
            foreach (var collider in overlaps)
                if (IsPlayer(collider)) _playerColliders.Add(collider);
            TryActivate();
        }

        private static bool IsPlayer(Collider2D collider) =>
            !collider.isTrigger && MainCharacter.CurrentMainCharacter &&
            collider.GetComponentInParent<MainCharacter>() == MainCharacter.CurrentMainCharacter;

        private void OnTriggerEnter2D(Collider2D collider)
        {
            if (!IsPlayer(collider)) return;
            _playerColliders.Add(collider);
            TryActivate();
        }

        private void OnTriggerExit2D(Collider2D collider)
        {
            if (_playerColliders.Remove(collider) && _playerColliders.Count == 0) _attempted = false;
        }

        private void TryActivate()
        {
            if (_attempted || !_level.SceneReady || _playerColliders.Count == 0) return;
            _attempted = true; // Busy requests are rejected once, never queued until the other scene finishes.
            CutsceneRunner.Instance.TryStart(cutsceneId, out _);
        }
    }
}
