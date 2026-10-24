using System.Collections;
using System.Reflection;
using Core.Game;
using Core.Location;
using Interaction;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;

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
        private SpawnableCatalog _catalog;

        [UnitySetUp]
        public IEnumerator EnterIsolatedPlayMode()
        {
            _scenes = EditorSceneManager.GetSceneManagerSetup();
            for (var i = 0; i < UnityEngine.SceneManagement.SceneManager.sceneCount; i++)
                if (UnityEngine.SceneManagement.SceneManager.GetSceneAt(i).isDirty)
                    Assert.Ignore("Save scene edits before running the isolated Play Mode regression.");
            _optionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            _options = EditorSettings.enterPlayModeOptions;
            _changedEnvironment = true;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            // Supply the isolated services before the bootstrap can load the full gameplay prefab.
            _systems = new GameObject("Spawn depletion systems");
            // Location registration is required; this test enters its location explicitly, without the UI or Start routine.
            _systems.AddComponent<LevelManager>().enabled = false;
            _systems.AddComponent<UI.Shared.UrGUIManager>().enabled = false;
            _systems.AddComponent<SystemRoot>();
            yield return new EnterPlayMode(false);
        }

        [UnityTearDown]
        public IEnumerator RestoreEditor()
        {
            if (!_changedEnvironment) yield break;
            if (_systems) Object.Destroy(_systems);
            if (_holder) Object.Destroy(_holder);
            if (_location) Object.Destroy(_location);
            if (_catalog) Object.Destroy(_catalog);
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
            systems.SetActive(false);
            Assert.That(systems.GetComponent<GameStateManager>(), Is.SameAs(GameStateManager.Instance));
            var spawner = systems.AddComponent<WorldObjectSpawner>();
            var holder = _holder = new GameObject("Inactive prefab holder");
            holder.SetActive(false);
            var prefabObject = new GameObject("Exhausted chest");
            prefabObject.transform.SetParent(holder.transform);
            var prefab = prefabObject.AddComponent<SpawnedObject>();
            typeof(SpawnedObject).GetField("prefabId", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(prefab, "base:exhausted");
            prefabObject.AddComponent<BoxCollider2D>();
            var interactable = prefabObject.AddComponent<TestInteractable>();
            typeof(AbstractInteractable).GetField("UnlimitedActivations", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(interactable, false);
            typeof(AbstractInteractable).GetField("DestroyWhenUsedUp", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(interactable, true);
            _catalog = ScriptableObject.CreateInstance<SpawnableCatalog>();
            _catalog.Synchronize(new[] { prefab });
            typeof(WorldObjectSpawner).GetField("catalog", BindingFlags.NonPublic | BindingFlags.Instance)
                .SetValue(spawner, _catalog);
            systems.SetActive(true);
            var location = _location = ScriptableObject.CreateInstance<LocationData>();
            location.id = "test:location";
            spawner.OnLocationEnter(location);
            var fresh = spawner.Spawn(prefab, Vector3.zero,
                new SpawnedObjectState { interaction = new InteractableState { uses = 1 } });
            Assert.That(GameState.World.TryGet(location.id, fresh.PersistentId, out SpawnedObjectState _), Is.False);
            yield return null; // Deferred Destroy completes.
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);

            spawner.OnLocationLeave(location);
            GameState.World.Set(location.id, "restored", new SpawnedObjectState
            {
                prefabId = prefab.PrefabId, interaction = new InteractableState { uses = 1 }
            });
            spawner.OnLocationEnter(location);
            Assert.That(GameState.World.TryGet(location.id, "restored", out SpawnedObjectState _), Is.False);
            yield return null;
            Assert.That(systems.GetComponentsInChildren<SpawnedObject>(true), Is.Empty);
            spawner.OnLocationLeave(location);
            GameState.World.Set(location.id, "authored-exhausted", new SpawnedObjectState
            {
                prefabId = prefab.PrefabId, authored = true,
                interaction = new InteractableState { uses = 1 }
            });
            var placements = new[] { new AuthoredSpawnPlacement { id = "authored-exhausted", template = prefab } };
            spawner.EnterLocation(location, placements);
            Assert.That(GameState.World.TryGet(location.id, "authored-exhausted", out SpawnedObjectState removed), Is.True);
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
