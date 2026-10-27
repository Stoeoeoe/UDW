using System;
using System.Linq;
using System.Reflection;
using Animancer;
using Character;
using Character.Animations;
using Core.Common.Editor;
using Core.Game;
using Core.Location;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class PlayAnimationActionTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _actor;
        private CharacterAnimation _animation;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Scripted animation");
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<CharacterManager>();
            _fixture.AddSingleton<Core.PlayerStateManager>();
            _fixture.RegisterSingleton<LevelManager>();
            GameState.Time.daysSinceStart = 1;
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            _actor = _fixture.CreateCharacter();
            _actor.EnsureRuntimeInitialized();
            _actor.Graphics.gameObject.SetActive(true);
            GameTestFixture.Invoke(_actor.Animator, "Awake");
            GameTestFixture.Invoke(_actor.GetComponentInChildren<NamedAnimancerComponent>(true), "Awake");
            _actor.transform.parent.gameObject.SetActive(true);
            _fixture.Root.SetActive(true);
            _animation = CreateAnimation("test:gesture");
        }

        [TearDown]
        public void TearDown()
        {
            if (_actor) _actor.Animator.EndInteractionAnimation();
            _fixture.Dispose();
        }

        [Test]
        public void SessionWaitsForNativeCompletionAndRetainsTheCutscenesControlClaim()
        {
            var api = new PlaybackApi(_actor, _animation);
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api),
                "Test.Play(); Test.Finish()", "animation-fixture");
            // CutsceneRunner holds this claim across all actions in the sequence.
            _actor.SetControlBlocked(session, true);
            session.Tick(0);
            Assert.That(api.Finished, Is.False);
            Assert.That(_actor.IsControlBlocked, Is.True);
            session.Tick(100); // Lua delta time is not a substitute for native animation completion.
            Assert.That(api.Finished, Is.False);
            var state = CurrentState();
            Assert.That(state.Clip, Is.SameAs(_animation.Clip));
            state.Time = state.Length;
            session.Tick(0);
            Assert.That(api.Finished, Is.True);
            Assert.That(session.IsRunning, Is.False);
            Assert.That(state.IsPlaying, Is.False);
            Assert.That(_actor.IsControlBlocked, Is.True);
            _actor.SetControlBlocked(session, false);
        }

        [Test]
        public void HoldLastFrameKeepsTheFinalPoseUntilMovementResumes()
        {
            _actor.Animator.OnLocationEnter(null);
            using var action = new PlayAnimationAction(_actor, _animation, true);
            var state = CurrentState();
            state.Time = state.Length + 0.1f;
            action.Dispose();
            Assert.That(action.IsCompleted, Is.True);
            Assert.That(CurrentState(), Is.SameAs(state));
            Assert.That(state.Time, Is.EqualTo(state.Length).Within(0.0001));
            Assert.That(state.IsPlaying, Is.False);
            _actor.Orientation.ForceDirection(Vector2.left);
            _actor.SetMovementState(MovementState.Idle);
            Assert.That(CurrentState(), Is.SameAs(state));
            _actor.SetMovementState(MovementState.Walking);
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void ANewAnimationReleasesTheHeldPoseAndAStaleHandleCannotStopIt()
        {
            using var first = new PlayAnimationAction(_actor, _animation, true);
            var state = CurrentState();
            state.Time = state.Length;
            first.Dispose();
            using var next = _actor.Animator.PlayOneShot(_animation);
            first.Dispose();
            Assert.That(next.IsInterrupted, Is.False);
            Assert.That(CurrentState().IsPlaying, Is.True);
            Assert.That(CurrentState().Time, Is.EqualTo(0));
        }

        [Test]
        public void CancellingAnUnfinishedHeldAnimationReleasesItsPose()
        {
            var api = new PlaybackApi(_actor, _animation, true);
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), "Test.Play(); Test.Finish()", "cancel-held-animation");
            session.Tick(0);
            session.Cancel();
            Assert.That(CurrentState(), Is.Null);
            Assert.That(api.Finished, Is.False);
        }

        [Test]
        public void HoldOptionDefaultsOffAndCompilesAsABoolean()
        {
            var source = Newtonsoft.Json.Linq.JArray.Parse("[{ 'id':'pose', 'action':'characters.playAnimation', 'arguments': { 'character':'player', 'animation':'base:pass-out' } }]");
            var legacy = CutsceneSequenceCompiler.Compile(source, "animation.json", out var steps);
            Assert.That(legacy, Does.Contain("\"base:pass-out\", false)"));
            Assert.That(steps.Single().Arguments.Single(argument => argument.Name == "holdLastFrame").Value, Is.EqualTo("false"));
            source[0]["arguments"]["holdLastFrame"] = true;
            Assert.That(CutsceneSequenceCompiler.Compile(source, "animation.json"), Does.Contain("\"base:pass-out\", true)"));
            source[0]["arguments"]["holdLastFrame"] = "true";
            Assert.That(() => CutsceneSequenceCompiler.Compile(source, "animation.json"), Throws.TypeOf<FormatException>());
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Characters").methods.Single(method => method.name == "PlayAnimation");
            var parameter = method.parameters.Single(parameter => parameter.name == "holdLastFrame");
            Assert.That(parameter.type, Is.EqualTo("boolean"));
            Assert.That(parameter.optional, Is.True);
            Assert.That(parameter.defaultValue, Is.EqualTo(false));
        }

        [Test]
        public void CancellingAnAwaitStopsPlaybackWithoutResumingLua()
        {
            var api = new PlaybackApi(_actor, _animation);
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), "Test.Play(); Test.Finish()", "cancel-animation");
            session.Tick(0);
            var state = CurrentState();
            session.Cancel();
            session.Cancel();
            session.Tick(100);
            Assert.That(api.Finished, Is.False);
            Assert.That(state.IsPlaying, Is.False);
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void ReplacementFailsTheAwaitWithoutStoppingTheReplacement()
        {
            var api = new PlaybackApi(_actor, _animation);
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), "Test.Play(); Test.Finish()", "interrupted-animation");
            session.Tick(0);
            // Reusing the exact clip also reuses its Animancer state; handle identity must still distinguish owners.
            var replacement = _actor.Animator.PlayOneShot(_animation);
            Assert.That(() => session.Tick(0), Throws.InvalidOperationException.With.Message.Contains("interrupted"));
            Assert.That(api.Finished, Is.False);
            Assert.That(replacement.IsInterrupted, Is.False);
            replacement.Dispose();
        }

        [Test]
        public void DirectionalPlaybackUsesThePerformingCharactersFacing()
        {
            _actor.Orientation.ForceDirection(Vector2.left);
            using var action = new PlayAnimationAction(_actor, _actor.PassOutAnimation);
            Assert.That(CurrentState().Clip, Is.SameAs(_actor.Animator.AnimationLibrary.GetDirectional("Death", Vector2.left)));
        }

        [Test]
        public void LoopingClipsAndMissingDirectionalActionsFailBeforePlayback()
        {
            var settings = AnimationUtility.GetAnimationClipSettings(_animation.Clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(_animation.Clip, settings);
            Assert.That(() => new PlayAnimationAction(_actor, _animation), Throws.InvalidOperationException.With.Message.Contains("non-looping"));
            Assert.That(CurrentState(), Is.Null);
            Set(_animation, "clip", null);
            Set(_animation, "memaoAction", "MissingRequiredAction");
            Assert.That(() => new PlayAnimationAction(_actor, _animation), Throws.InvalidOperationException);
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void DisablingTheAnimatorInterruptsTheAwait()
        {
            var api = new PlaybackApi(_actor, _animation);
            using var session = VulcanusLuaEngine.StartSession(new LuaBindingRegistry(api), "Test.Play(); Test.Finish()", "disabled-animation");
            session.Tick(0);
            _actor.Animator.enabled = false;
            GameTestFixture.Invoke(_actor.Animator, "OnDisable");
            Assert.That(() => session.Tick(0), Throws.InvalidOperationException.With.Message.Contains("interrupted"));
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void ManifestAndCompilerExposeTheAnimationPicker()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Characters")
                .methods.Single(method => method.action.id == "characters.playAnimation");
            Assert.That(method.action.execution, Is.EqualTo("awaitable"));
            Assert.That(method.action.contexts, Is.EqualTo(new[] { "cutscene" }));
            var parameter = method.parameters.Single(parameter => parameter.name == "animation");
            Assert.That(parameter.resourceType, Is.EqualTo("animation"));
            Assert.That(parameter.semanticType, Is.Null);
            Assert.That(parameter.picker, Is.Null);
            Assert.That(method.action.preview.spatialState, Is.EqualTo("unknown"));
            var sequence = JArray.Parse("[{'id':'gesture','action':'characters.playAnimation','arguments':{'character':'player','animation':'base:pass-out'}}]");
            Assert.That(CutsceneSequenceCompiler.Compile(sequence, "animation.json"),
                Is.EqualTo("Characters.PlayAnimation(\"player\", \"base:pass-out\");\n"));
        }

        [Test]
        public void ChoicesIncludeOnlyEnabledFiniteSinglesInStableIdOrder()
        {
            var catalog = _fixture.Own(ScriptableObject.CreateInstance<CharacterAnimationCatalog>());
            var other = CreateAnimation("test:another");
            var loop = CreateAnimation("test:loop");
            var settings = AnimationUtility.GetAnimationClipSettings(loop.Clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(loop.Clip, settings);
            var set = _fixture.Own(ScriptableObject.CreateInstance<CharacterAnimationSet>());
            Set(set, "animationId", "test:set");
            Set(set, "baseAnimation", _animation);
            catalog.Synchronize(new CharacterAnimationDefinition[] { _animation, loop, set, other, _actor.PassOutAnimation });
            var libraries = new[] { _actor.Animator.AnimationLibrary };
            var first = VulcanusLuaEngine.DescribeBindings();
            LuaBindingManifestExporter.PopulateResources(first, catalog, libraries, Resources.Load<SoundCatalog>(SoundCatalog.ResourceName), Resources.Load<Core.TimeAndWeather.WeatherCatalog>(Core.TimeAndWeather.WeatherCatalog.ResourceName));
            Assert.That(first.resources["animation"].Select(choice => choice.id),
                Is.EqualTo(new[] { "base:pass-out", "test:another", "test:gesture" }));
            Assert.That(first.resources["animation"].Single(choice => choice.id == "test:gesture").description, Is.EqualTo("test:gesture"));
            catalog.SetEnabled(other, false);
            var next = VulcanusLuaEngine.DescribeBindings();
            LuaBindingManifestExporter.PopulateResources(next, catalog, libraries, Resources.Load<SoundCatalog>(SoundCatalog.ResourceName), Resources.Load<Core.TimeAndWeather.WeatherCatalog>(Core.TimeAndWeather.WeatherCatalog.ResourceName));
            Assert.That(next.resources["animation"].Select(choice => choice.id), Is.EqualTo(new[] { "base:pass-out", "test:gesture" }));
        }

        [Test]
        public void CatalogResolvesTheAuthoredIdAndRejectsMissingIds()
        {
            Assert.That(CharacterAnimationCatalog.RequireOneShot("base:pass-out"), Is.SameAs(_actor.PassOutAnimation));
            Assert.That(() => CharacterAnimationCatalog.RequireOneShot("test:missing"), Throws.InvalidOperationException.With.Message.Contains("not registered and enabled"));
        }

        private CharacterAnimation CreateAnimation(string id)
        {
            var clip = _fixture.Own(new AnimationClip());
            AnimationUtility.SetEditorCurve(clip, EditorCurveBinding.FloatCurve("", typeof(Transform), "m_LocalScale.z"), AnimationCurve.Constant(0, 1, 1));
            var animation = _fixture.Own(ScriptableObject.CreateInstance<CharacterAnimation>());
            animation.name = id;
            Set(animation, "animationId", id);
            Set(animation, "clip", clip);
            return animation;
        }

        private AnimancerState CurrentState() => (AnimancerState)typeof(UrCharacterAnimator)
            .GetField("_interactionState", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_actor.Animator);

        private static void Set(object target, string name, object value)
        {
            for (var type = target.GetType(); type != null; type = type.BaseType)
            {
                var field = type.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                if (field == null) continue;
                field.SetValue(target, value);
                return;
            }
            throw new MissingFieldException(name);
        }

        [LuaModule("Test")]
        private sealed class PlaybackApi
        {
            private readonly GameCharacter _actor;
            private readonly CharacterAnimation _animation;
            private readonly bool _holdLastFrame;
            public bool Finished;
            public PlaybackApi(GameCharacter character, CharacterAnimation animation, bool holdLastFrame = false) { _actor = character; _animation = animation; _holdLastFrame = holdLastFrame; }
            [LuaAction("test.play", "Play", "Test", "Play the fixture animation.", "cutscene", Phases = new[] { "sequence" })]
            public ILuaAction Play() => new PlayAnimationAction(_actor, _animation, _holdLastFrame);
            [LuaAction("test.finish", "Finish", "Test", "Observe completion.", "cutscene", Phases = new[] { "sequence" })]
            public void Finish() => Finished = true;
        }
    }
}
