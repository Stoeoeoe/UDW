using System;
using System.Collections;
using System.Reflection;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using Interaction;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using VContainer;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Spawning.Editor
{
    /// <summary>Real Awake/OnEnable regression: EditMode-only simulation misses re-entrant depletion.</summary>
    public sealed class SpawnDepletionTests
    {
        private SceneSetup[] _scenes;
        private bool _optionsEnabled;
        private EnterPlayModeOptions _options;
        private bool _changedEnvironment;
        private GameObject _systems;
        private GameObject _holder;
        private LocationData _location;
        private WorldObjectSpawner _spawner;

        [UnitySetUp]
        public IEnumerator EnterIsolatedPlayMode()
        {
            _scenes = EditorSceneManager.GetSceneManagerSetup();
            for (var i = 0; i < SceneManager.sceneCount; i++)
                if (SceneManager.GetSceneAt(i).isDirty)
                    Assert.Ignore("Save scene edits before running the isolated Play Mode regression.");
            _optionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            _options = EditorSettings.enterPlayModeOptions;
            _changedEnvironment = true;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
            EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode(false);
            var root = LifetimeScope.Find<SystemRoot>();
            _systems = root.gameObject;
            var level = root.Container.Resolve<LevelManager>();
            var deadline = Time.realtimeSinceStartupAsDouble + 15;
            while (!level.SceneReady)
            {
                Assert.That(Time.realtimeSinceStartupAsDouble, Is.LessThan(deadline));
                yield return null;
            }
            _spawner = root.Container.Resolve<WorldObjectSpawner>();
            _spawner.OnLocationLeave(level.CurrentLocationData);
        }

        [UnityTearDown]
        public IEnumerator RestoreEditor()
        {
            if (!_changedEnvironment) yield break;
            if (_systems) Object.Destroy(_systems);
            if (_holder) Object.Destroy(_holder);
            if (_location) Object.Destroy(_location);
            if (Application.isPlaying) yield return new ExitPlayMode();
            EditorSettings.enterPlayModeOptionsEnabled = _optionsEnabled;
            EditorSettings.enterPlayModeOptions = _options;
            if (_scenes.Length > 0) EditorSceneManager.RestoreSceneManagerSetup(_scenes);
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            _changedEnvironment = false;
        }

        [UnityTest]
        public IEnumerator ExhaustedObjectsRemoveTheirRecordOnFreshSpawnAndLocationReentry()
        {
            var systems = _systems;
            var spawner = _spawner;
            var holder = _holder = new GameObject("Inactive prefab holder");
            holder.SetActive(false);
            var prefabObject = new GameObject("Exhausted chest");
            prefabObject.transform.SetParent(holder.transform);
            var prefab = prefabObject.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(prefab, "base:exhausted");
            prefabObject.layer = LayerMask.NameToLayer("Interactable");
            prefabObject.AddComponent<BoxCollider2D>();
            var interactable = prefabObject.AddComponent<TestInteractable>();
            typeof(AbstractInteractable).GetField("UnlimitedActivations", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(interactable, false);
            typeof(AbstractInteractable).GetField("DestroyWhenUsedUp", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(interactable, true);
            spawner.Register(prefab);
            var location = _location = ScriptableObject.CreateInstance<LocationData>();
            location.SetId("test:location");
            spawner.EnterLocation(location, Array.Empty<AuthoredSpawnPlacement>());
            var fresh = spawner.Spawn(prefab, Vector3.zero,
                new SpawnedObjectState { interaction = new InteractableState { uses = 1 } });
            Assert.That(LiveGame.Get<GameState>().World.TryGet(location.Id, fresh.PersistentId, out SpawnedObjectState _), Is.False);
            yield return null; // Deferred Destroy completes.
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);

            spawner.OnLocationLeave(location);
            LiveGame.Get<GameState>().World.Set(location.Id, "restored", new SpawnedObjectState
            {
                prefabId = prefab.Id, interaction = new InteractableState { uses = 1 }
            });
            spawner.EnterLocation(location, Array.Empty<AuthoredSpawnPlacement>());
            Assert.That(LiveGame.Get<GameState>().World.TryGet(location.Id, "restored", out SpawnedObjectState _), Is.False);
            yield return null;
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);
            spawner.OnLocationLeave(location);
            LiveGame.Get<GameState>().World.Set(location.Id, "authored-exhausted", new SpawnedObjectState
            {
                prefabId = prefab.Id, authored = true,
                interaction = new InteractableState { uses = 1 }
            });
            var placements = new[] { new AuthoredSpawnPlacement { id = "authored-exhausted", template = prefab } };
            spawner.EnterLocation(location, placements);
            Assert.That(LiveGame.Get<GameState>().World.TryGet(location.Id, "authored-exhausted", out SpawnedObjectState removed), Is.True);
            Assert.That(removed.removed, Is.True);
            yield return null;
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);
            spawner.OnLocationLeave(location);
            spawner.EnterLocation(location, placements);
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);
            Object.Destroy(systems);
            Object.Destroy(holder);
            Object.Destroy(location);
            yield return null;
        }
    }
}
