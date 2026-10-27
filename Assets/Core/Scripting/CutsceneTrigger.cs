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
        private CutsceneRunner _runner;
        private readonly HashSet<Collider2D> _playerColliders = new();
        private bool _attempted;
        private bool _leftDuringCutscene;
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
            _runner = CutsceneRunner.Instance;
            _level.LocationReady += OnReady;
            _runner.Finished += OnCutsceneFinished;
            if (_level.SceneReady) CheckInitialOverlap();
        }

        private void OnDisable()
        {
            _level.LocationReady -= OnReady;
            _runner.Finished -= OnCutsceneFinished;
            _playerColliders.Clear();
            _attempted = false;
            _leftDuringCutscene = false;
        }

        private void OnReady(LocationData location) => CheckInitialOverlap();

        private void CheckInitialOverlap()
        {
            RefreshPlayerOverlap();
            TryActivate();
        }

        private void RefreshPlayerOverlap()
        {
            // Entry placement may have changed transforms since the last physics step.
            Physics2D.SyncTransforms();
            var overlaps = new List<Collider2D>();
            _area.Overlap(new ContactFilter2D().NoFilter(), overlaps);
            _playerColliders.Clear();
            foreach (var collider in overlaps)
                if (IsPlayer(collider)) _playerColliders.Add(collider);
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
            if (!_playerColliders.Remove(collider) || _playerColliders.Count != 0) return;
            if (_attempted && _runner.IsRunning) _leftDuringCutscene = true;
            else
            {
                _attempted = false;
                _leftDuringCutscene = false;
            }
        }

        private void OnCutsceneFinished(CutsceneRun run)
        {
            if (!_leftDuringCutscene) return;
            _leftDuringCutscene = false;
            // Staging and restoration belong to the same player visit. Physics enter/exit
            // callbacks for the restored position may not have run yet.
            RefreshPlayerOverlap();
            _attempted = _playerColliders.Count > 0;
        }

        private void TryActivate()
        {
            if (_attempted || !_level.SceneReady || _playerColliders.Count == 0) return;
            _attempted = true; // Busy requests are rejected once, never queued until the other scene finishes.
            _runner.TryStart(cutsceneId, out _);
        }
    }
}
