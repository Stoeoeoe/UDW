using System.Collections;
using System.Linq;
using Character;
using Core.Location;
using Core.Spawning;
using Core.Tile;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;

namespace Core.Scripting.Editor
{
    /// <summary>Runs in the authored map-1 scene with its real player, controller and colliders.</summary>
    [Explicit("Enters Play Mode using the authored map-1 scene.")]
    public sealed class MoveToActionPlayTests
    {
        [UnitySetUp]
        public IEnumerator EnterMap()
        {
            // The test runner starts from an empty scene; load the complete gameplay fixture first.
            EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var readyDeadline = Time.realtimeSinceStartup + 15f;
            while (!LevelManager.Instance || !LevelManager.Instance.SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(readyDeadline), "The playable map must finish initialization.");
                yield return null;
            }
        }

        [UnityTest]
        public IEnumerator LuaWaitsForArrivalAndReleasesMovementOnCancellation()
        {
            var actor = MainCharacter.CurrentMainCharacter;
            Assert.That(actor, Is.Not.Null);
            Assert.That(actor.IsRuntimeInitialized, Is.True);
            Assert.That(actor.IsControlBlocked, Is.False);
            var body = actor.GetComponent<Rigidbody2D>();
            var start = body.position;
            var target = FindClearTarget(actor);
            var api = new MovementApi(actor, target);
            using (var run = Start(api))
            {
                run.Tick(0);
                Assert.That(actor.Controller.IsMovementOwned, Is.True, run.Error);
                Assert.That(api.Arrived, Is.False);
                var frames = 0;
                while (run.Status == LuaExecutionStatus.Running && frames++ < 600)
                {
                    yield return null;
                    run.Tick(Time.unscaledDeltaTime);
                }
                Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Succeeded), run.Error);
                Assert.That(frames, Is.GreaterThan(1), "Movement must span actual Unity frames.");
                Assert.That(Vector2.Distance(body.position, start), Is.GreaterThan(0.2f));
                Assert.That(Vector2.Distance(body.position, target), Is.LessThanOrEqualTo(0.04f));
                Assert.That(api.Arrived, Is.True);
                AssertReleased(actor);
            }

            // Walk back along the same clear path, then cancel while Lua is waiting.
            api = new MovementApi(actor, start);
            using (var run = Start(api))
            {
                run.Tick(0);
                for (var frame = 0; frame < 3; frame++)
                {
                    yield return null;
                    run.Tick(Time.unscaledDeltaTime);
                }
                Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Running), run.Error);
                run.Cancel();
                run.Cancel();
                run.Tick(0);
                Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Cancelled));
                Assert.That(api.Arrived, Is.False);
                AssertReleased(actor);
            }
        }

        [UnityTest]
        public IEnumerator ActorBindingResolvesAnchorWorldPositionsAndRejectsInvalidIds()
        {
            var actor = MainCharacter.CurrentMainCharacter;
            var map = MapManager.Instance.CurrentMap;
            var authoredAnchor = map.GetComponentsInChildren<VulcanusMapAnchor>(true).First();
            var api = MapActorLuaApi.BindCurrentMap();
            api.ValidateMoveTo("player", authoredAnchor.AnchorId);
            Assert.That(() => api.ValidateMoveTo("missing-actor", authoredAnchor.AnchorId), Throws.InvalidOperationException);
            Assert.That(() => api.ValidateMoveTo("player", "missing-anchor"), Throws.InvalidOperationException);
            Assert.That(() => api.ValidateMoveTo(actor.gameObject.name, authoredAnchor.AnchorId), Throws.InvalidOperationException);
            Assert.That(() => api.ValidateFace("missing-actor", "player"), Throws.InvalidOperationException);
            Assert.That(() => api.ValidateFace("player", "missing-actor"), Throws.InvalidOperationException);
            Assert.That(() => api.ValidateFace("player", "player"), Throws.InvalidOperationException);
            Assert.That(() => api.Face("player", "player"), Throws.InvalidOperationException);
            Assert.That(actor.Controller.IsMovementOwned, Is.False, "Reference validation must not start movement.");
            foreach (var placement in map.PersistentEntities)
                Assert.That(WorldObjectSpawner.Instance.SpawnedObjects, Has.No.Member(placement.template));

            var holder = new GameObject("Test anchor group");
            holder.transform.SetParent(map.transform, false);
            holder.transform.localPosition = new Vector3(3, 2, 0);
            holder.transform.localRotation = Quaternion.Euler(0, 0, 45);
            var target = FindClearTarget(actor);
            var anchor = new GameObject("Display name is not an ID").AddComponent<VulcanusMapAnchor>();
            anchor.transform.SetParent(holder.transform, false);
            anchor.transform.position = target;
            anchor.Configure("test:meeting", "Meeting", Vector2.down, System.Array.Empty<string>());
            api = MapActorLuaApi.BindCurrentMap();
            var registry = new LuaBindingRegistry(api);
            var method = registry.Describe().modules.Single().methods.Single(value => value.name == "MoveTo");
            Assert.That(method.action.id, Is.EqualTo("actors.moveTo"));
            Assert.That(method.action.execution, Is.EqualTo("awaitable"));
            Assert.That(method.parameters[0].semanticType, Is.EqualTo("actorRef"));
            Assert.That(method.parameters[1].picker, Is.EqualTo("mapAnchor"));

            using (var run = VulcanusLuaEngine.StartSession(registry,
                "Actors.MoveTo('player', 'test:meeting')", "AnchorBindingPlayTest"))
            {
                run.Tick(0);
                Assert.That(actor.Controller.IsMovementOwned, Is.True, run.Error);
                var frames = 0;
                while (run.Status == LuaExecutionStatus.Running && frames++ < 600)
                {
                    yield return null;
                    run.Tick(Time.unscaledDeltaTime);
                }
                Assert.That(run.Status, Is.EqualTo(LuaExecutionStatus.Succeeded), run.Error);
                Assert.That(Vector2.Distance(actor.GetComponent<Rigidbody2D>().position, target), Is.LessThanOrEqualTo(0.04f));
                AssertReleased(actor);
            }

            var duplicate = new GameObject("Duplicate anchor").AddComponent<VulcanusMapAnchor>();
            duplicate.transform.SetParent(holder.transform, false);
            duplicate.Configure("test:meeting", "Duplicate", Vector2.zero, System.Array.Empty<string>());
            Assert.That(() => MapActorLuaApi.BindCurrentMap(), Throws.InvalidOperationException);
            Object.DestroyImmediate(duplicate.gameObject);
            anchor.Configure("", "Missing ID", Vector2.zero, System.Array.Empty<string>());
            Assert.That(() => MapActorLuaApi.BindCurrentMap(), Throws.InvalidOperationException);
            Object.DestroyImmediate(holder);
        }

        [UnityTearDown]
        public IEnumerator LeavePlayMode()
        {
            if (Application.isPlaying) yield return new ExitPlayMode();
        }

        [UnityTest]
        public IEnumerator NavigationWorksWithoutLuaAndRejectsABlockedDirectRoute()
        {
            var actor = MainCharacter.CurrentMainCharacter;
            var target = FindClearTarget(actor);
            using (var move = CharacterNavigation.MoveTo(actor, target))
            {
                var frames = 0;
                while (move.Status == NavigationMoveStatus.Moving && frames++ < 600)
                {
                    yield return null;
                    move.Tick(Time.unscaledDeltaTime);
                }
                Assert.That(move.Status, Is.EqualTo(NavigationMoveStatus.Arrived), move.Error);
                Assert.That(Vector2.Distance(actor.GetComponent<Rigidbody2D>().position, target), Is.LessThanOrEqualTo(0.04f));
                AssertReleased(actor);
            }

            target = FindClearTarget(actor);
            var body = actor.GetComponent<Rigidbody2D>();
            var start = body.position;
            var direction = (target - start).normalized;
            var collider = actor.GetComponent<Collider2D>();
            var wall = new GameObject("Navigation test wall");
            try
            {
                var mask = Physics2D.GetLayerCollisionMask(collider.gameObject.layer);
                wall.layer = Enumerable.Range(0, 32).First(layer => (mask & (1 << layer)) != 0);
                var extent = Vector2.Dot(new Vector2(Mathf.Abs(direction.x), Mathf.Abs(direction.y)), collider.bounds.extents);
                wall.transform.position = collider.bounds.center + (Vector3)(direction * (extent + 0.1f));
                wall.AddComponent<BoxCollider2D>().size = direction.x != 0 ? new Vector2(0.05f, 2f) : new Vector2(2f, 0.05f);
                Physics2D.SyncTransforms();

                using var blocked = CharacterNavigation.MoveTo(actor, target);
                Assert.That(blocked.Status, Is.EqualTo(NavigationMoveStatus.Unreachable));
                Assert.That(blocked.Error, Does.Contain("straight-line route"));
                Assert.That(body.position, Is.EqualTo(start));
                AssertReleased(actor);

                using var lua = new MoveToAction(actor, target);
                Assert.That(lua.Status, Is.EqualTo(LuaExecutionStatus.Failed));
                AssertReleased(actor);
            }
            finally { Object.DestroyImmediate(wall); }
        }

        private static LuaExecutionSession Start(MovementApi api) => VulcanusLuaEngine.StartSession(
            new LuaBindingRegistry(api), "Test.Move(); Test.MarkArrived()", "MoveToActionPlayTests");

        private static void AssertReleased(GameCharacter actor)
        {
            Assert.That(actor.Controller.IsMovementOwned, Is.False);
            Assert.That(actor.Controller.CurrentVelocity, Is.EqualTo(Vector2.zero));
            Assert.That(actor.IsControlBlocked, Is.False);
            Assert.That(actor.MovementState, Is.EqualTo(MovementState.Idle));
        }

        private static Vector2 FindClearTarget(GameCharacter actor)
        {
            var collider = actor.GetComponent<Collider2D>();
            Assert.That(collider, Is.Not.Null, "The real actor requires its physical collider.");
            var hits = new RaycastHit2D[16];
            var filter = new ContactFilter2D { useTriggers = false };
            foreach (var direction in new[] { Vector2.right, Vector2.left, Vector2.up, Vector2.down })
                if (collider.Cast(direction, filter, hits, 0.5f) == 0)
                    return actor.GetComponent<Rigidbody2D>().position + direction * 0.4f;
            Assert.Fail("The playable fixture requires a clear half-unit path beside the player.");
            throw new System.InvalidOperationException("No clear test path.");
        }

        [LuaModule("Test")]
        private sealed class MovementApi
        {
            private readonly GameCharacter _actor;
            private readonly Vector2 _target;
            public bool Arrived;
            public MovementApi(GameCharacter actor, Vector2 target)
            { _actor = actor; _target = target; }
            [LuaCall(true), LuaAction("test.move", "Move", "Test", "Walk the fixture actor", "cutscene")]
            public ILuaAction Move() => new MoveToAction(_actor, _target);
            [LuaCall, LuaAction("test.arrived", "Arrived", "Test", "Observe Lua continuation", "cutscene")]
            public void MarkArrived() => Arrived = true;
        }
    }
}
