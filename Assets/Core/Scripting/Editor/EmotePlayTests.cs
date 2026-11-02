using System.Collections;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Character;
using Character.Animations;
using Core.Location;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    [Explicit("Exercises emote callouts and Lua cleanup on the playable map.")]
    public sealed class EmotePlayTests
    {
        [UnitySetUp]
        public IEnumerator SetUp()
        {
            if (UnityEngine.SceneManagement.SceneManager.GetActiveScene().path != "Assets/Scenes/Maps/map-1.unity")
                EditorSceneManager.OpenScene("Assets/Scenes/Maps/map-1.unity", OpenSceneMode.Single);
            yield return new EnterPlayMode();
            var deadline = Time.realtimeSinceStartup + 15f;
            while (!LevelManager.Instance || !LevelManager.Instance.SceneReady)
            {
                Assert.That(Time.realtimeSinceStartup, Is.LessThan(deadline));
                yield return null;
            }
        }

        [UnityTest]
        public IEnumerator MissingCharacterAnimationStillShowsTheCalloutAndLuaWaitsUntilCompletion()
        {
            var emote = ScriptableObject.CreateInstance<EmoteDefinition>();
            var animation = ScriptableObject.CreateInstance<CharacterAnimation>();
            Set(animation, "animationId", "fixture:missing-emote-animation");
            Set(animation, "memaoAction", "MissingEmoteAnimation");
            Set(emote, "emoteId", "fixture:emote");
            Set(emote, "duration", 1f);
            Set(emote, "animation", animation);
            var icon = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/UI/InventoryScreen/UseIcon.png");
            Assert.That(icon, Is.Not.Null);
            Set(emote, "calloutIcon", icon);
            emote.RequireValidConfiguration();
            var catalog = Resources.Load<EmoteCatalog>(EmoteCatalog.ResourceName);
            var previous = catalog.Entries.Select(entry => entry.Definition).ToArray();
            catalog.Synchronize(previous.Append(emote));
            var actor = MainCharacter.CurrentMainCharacter;
            try
            {
                var characters = MapActorLuaApi.BindCurrentMap();
                Assert.That(() => characters.ValidateEmote("player", "fixture:unknown"), Throws.InvalidOperationException);
                LogAssert.Expect(LogType.Warning, new Regex("Emote 'fixture:emote'.*has no animation"));
                using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(characters),
                    "Characters.Emote('player', 'fixture:emote')", "fixture:emote");
                session.Tick(0);
                var callout = actor.Graphics.Find("Emote callout").gameObject;
                Assert.That(callout.GetComponent<SpriteRenderer>().sprite, Is.SameAs(icon));
                var position = callout.transform.position;
                actor.transform.position += Vector3.right;
                Assert.That(callout.transform.position, Is.EqualTo(position + Vector3.right));
                session.Tick(0.5f);
                Assert.That(session.IsRunning, Is.True);
                Assert.That(callout.activeSelf, Is.True);
                session.Tick(0.5f);
                Assert.That(session.IsRunning, Is.True, "The default pause follows the gesture.");
                Assert.That(callout.activeSelf, Is.False);
                yield return null;
                Assert.That(callout == null, Is.True);
                session.Tick(0.5f);
                Assert.That(session.IsRunning, Is.True);
                session.Tick(0.5f);
                Assert.That(session.IsRunning, Is.False);

                Set(emote, "animation", null);
                using var cancelled = new EmoteAction(actor, emote);
                var cancelledCallout = actor.Graphics.Find("Emote callout").gameObject;
                cancelled.Dispose();
                Assert.That(cancelledCallout.activeSelf, Is.False);
                yield return null;
                Assert.That(cancelledCallout == null, Is.True);

                using var overridden = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(characters),
                    "Characters.Emote('player', 'fixture:emote', 0.25, 0)", "fixture:emote-override");
                overridden.Tick(0);
                overridden.Tick(0.125f);
                Assert.That(overridden.IsRunning, Is.True);
                overridden.Tick(0.125f);
                Assert.That(overridden.IsRunning, Is.False);
                Assert.That(emote.Duration, Is.EqualTo(1f));
                yield return null;
            }
            finally
            {
                catalog.Synchronize(previous);
                Object.Destroy(emote);
                Object.Destroy(animation);
            }
        }

        [UnityTearDown]
        public IEnumerator TearDown() { yield return new ExitPlayMode(); }

        private static void Set(object target, string name, object value)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var field = type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                if (field == null) continue;
                field.SetValue(target, value);
                return;
            }
            throw new System.MissingFieldException(name);
        }
    }
}
