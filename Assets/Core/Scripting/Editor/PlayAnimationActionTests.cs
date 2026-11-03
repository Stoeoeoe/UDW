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
using MoreMountains.Tools;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace Core.Scripting.Editor
{
    public sealed class PlayAnimationActionTests : Core.Common.Editor.GameTest
    {

        private MainCharacter _actor;
        private CharacterAnimation _animation;

        [SetUp]
        public void SetUp()
        {

            Game.State.Time.daysSinceStart = 1;
            Game.State.Player.Home = new PlayerHomeState("test:home", "test-bed");
            _actor = Game.CreateAnimatedCharacter();
            _animation = CreateAnimation("test:gesture");
        }

        [TearDown]
        public void TearDown()
        {
            if (_actor) _actor.Animator.EndInteractionAnimation();

        }

        [Test]
        public void SessionWaitsForNativeCompletionAndRetainsTheCutscenesControlClaim()
        {
            var api = new PlaybackApi(_actor, _animation);
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api),
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
            AdvanceAnimation(state.Length);
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
            var animancer = _actor.GetComponentInChildren<NamedAnimancerComponent>(true);
            AdvanceAnimation(state.Length + 0.1f);
            var completedTime = state.Time;
            action.Dispose();
            Assert.That(action.IsCompleted, Is.True);
            Assert.That(CurrentState(), Is.SameAs(state));
            Assert.That(state.Time, Is.EqualTo(completedTime).Within(0.0001));
            Assert.That(state.IsPlaying, Is.False);
            Assert.That(animancer.Animator.transform.localScale.z, Is.EqualTo(2f).Within(0.0001));
            animancer.Evaluate(0.5f);
            Assert.That(state.Time, Is.EqualTo(completedTime).Within(0.0001));
            Assert.That(animancer.Animator.transform.localScale.z, Is.EqualTo(2f).Within(0.0001));
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
            AdvanceAnimation(state.Length);
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
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api), "Test.Play(); Test.Finish()", "cancel-held-animation");
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
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api), "Test.Play(); Test.Finish()", "cancel-animation");
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
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api), "Test.Play(); Test.Finish()", "interrupted-animation");
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
            using var session = VulcanusLuaEngine.StartSession(Game.Bind(api), "Test.Play(); Test.Finish()", "disabled-animation");
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
                Is.EqualTo("Characters.PlayAnimation(\"player\", \"base:pass-out\", false);\n"));
        }

        [Test]
        public void ChoicesIncludeOnlyEnabledFiniteSinglesInStableIdOrder()
        {
            var catalog = Game.Asset<CharacterAnimationCatalog>();
            var other = CreateAnimation("test:another");
            var loop = CreateAnimation("test:loop");
            var settings = AnimationUtility.GetAnimationClipSettings(loop.Clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(loop.Clip, settings);
            var set = Game.Asset<CharacterAnimationSet>();
            Set(set, "animationId", "test:set");
            Set(set, "baseAnimation", _animation);
            catalog.Synchronize(new CharacterAnimationDefinition[] { _animation, loop, set, other, _actor.PassOutAnimation });
            var libraries = new[] { _actor.Animator.AnimationLibrary };
            var first = LuaBindingManifestExporter.DescribeAnimations(catalog, libraries);
            Assert.That(first.Select(choice => choice.id),
                Is.EqualTo(new[] { "base:pass-out", "test:another", "test:gesture" }));
            Assert.That(first.Single(choice => choice.id == "test:gesture").description, Is.EqualTo("test:gesture"));
            catalog.SetEnabled(other, false);
            var next = LuaBindingManifestExporter.DescribeAnimations(catalog, libraries);
            Assert.That(next.Select(choice => choice.id), Is.EqualTo(new[] { "base:pass-out", "test:gesture" }));
        }

        [Test]
        public void CatalogResolvesTheAuthoredIdAndRejectsMissingIds()
        {
            Assert.That(Game.Get<CharacterAnimationCatalog>().RequireOneShot("base:pass-out"), Is.SameAs(_actor.PassOutAnimation));
            Assert.That(() => Game.Get<CharacterAnimationCatalog>().RequireOneShot("test:missing"), Throws.InvalidOperationException.With.Message.Contains("not registered and enabled"));
        }

        private CharacterAnimation CreateAnimation(string id)
        {
            var clip = Game.Own(new AnimationClip());
            AnimationUtility.SetEditorCurve(clip, EditorCurveBinding.FloatCurve("", typeof(Transform), "m_LocalScale.z"), AnimationCurve.Linear(0, 1, 1, 2));
            var animation = Game.Asset<CharacterAnimation>();
            animation.name = id;
            Set(animation, "animationId", id);
            Set(animation, "clip", clip);
            return animation;
        }

        private AnimancerState CurrentState() => (AnimancerState)typeof(UrCharacterAnimator)
            .GetField("_interactionState", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_actor.Animator);

        [Test]
        public void EmoteKeepsItsPoseUntilItsDurationEndsAndCancellationReleasesIt()
        {
            var emote = CreateEmote();
            using var action = new EmoteAction(_actor, emote);
            var state = CurrentState();
            AdvanceAnimation(state.Length / emote.PlaybackSpeed + 0.1f);
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.False);
            Assert.That(CurrentState(), Is.SameAs(state));
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.True);
            action.Dispose();
            Assert.That(CurrentState(), Is.Null);

            using var cancelled = new EmoteAction(_actor, emote);
            cancelled.Dispose();
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void PostEmotePauseReleasesThePoseBeforeTheNextActionCanContinue()
        {
            using var action = new EmoteAction(_actor, CreateEmote(), pauseAfterSeconds: 1);
            action.Tick(1f);
            Assert.That(CurrentState(), Is.Null);
            Assert.That(action.IsCompleted, Is.False);
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.False);
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.True);
        }

        [Test]
        public void AFrameCrossingTheEndOfTheGestureCountsOnlyItsRemainderTowardThePause()
        {
            using var action = new EmoteAction(_actor, CreateEmote(), pauseAfterSeconds: 1);
            action.Tick(1.5f);
            Assert.That(CurrentState(), Is.Null);
            Assert.That(action.IsCompleted, Is.False);
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.True);
        }

        [TestCase(-1d)]
        [TestCase(double.NaN)]
        [TestCase(double.PositiveInfinity)]
        public void InvalidPostEmotePausesFailBeforePlayback(double pauseAfterSeconds)
        {
            Assert.That(() => new EmoteAction(_actor, CreateEmote(), pauseAfterSeconds: pauseAfterSeconds),
                Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(CurrentState(), Is.Null);
        }

        [TestCase(0d, 1f)]
        [TestCase(0.25d, 0.25f)]
        [TestCase(2.5d, 2.5f)]
        public void EmoteDurationOverrideUsesTheDefaultOrTheRequestedSeconds(double durationSeconds, float expected)
        {
            var emote = CreateEmote();
            Assert.That(emote.PlaybackSpeed, Is.EqualTo(0.5f));
            using var action = new EmoteAction(_actor, emote, durationSeconds);
            action.Tick(expected * 0.5f);
            Assert.That(action.IsCompleted, Is.False);
            action.Tick(expected * 0.5f);
            Assert.That(action.IsCompleted, Is.True);
            Assert.That(emote.Duration, Is.EqualTo(1f), "A play override must not modify the shared definition.");
        }

        [TestCase(-1d)]
        [TestCase(double.NaN)]
        [TestCase(double.PositiveInfinity)]
        [TestCase(double.MaxValue)]
        public void InvalidDurationOverridesFailBeforePlayback(double durationSeconds)
        {
            Assert.That(() => new EmoteAction(_actor, CreateEmote(), durationSeconds), Throws.TypeOf<ArgumentOutOfRangeException>());
            Assert.That(CurrentState(), Is.Null);
        }

        [TestCase(0.5f)]
        [TestCase(2f)]
        public void EmoteSpeedScalesNativeMotionAndIsRestoredBeforeReusingTheClip(float speed)
        {
            var emote = CreateEmote();
            Set(emote, "playbackSpeed", speed);
            using var action = new EmoteAction(_actor, emote);
            var state = CurrentState();
            Assert.That(state.Speed, Is.EqualTo(speed));
            AdvanceAnimation(state.Length * 0.25f);
            Assert.That(state.Time, Is.EqualTo(state.Length * 0.25f * speed).Within(0.001f));
            action.Tick(0.5f);
            Assert.That(action.IsCompleted, Is.False, "Speed must not change the authored emote duration.");
            using var replacement = _actor.Animator.PlayOneShot(_animation);
            Assert.That(CurrentState().Speed, Is.EqualTo(1f));
            action.Dispose();
            Assert.That(replacement.IsInterrupted, Is.False);
            Assert.That(CurrentState().Speed, Is.EqualTo(1f));
        }

        [TestCase(0f)]
        [TestCase(-1f)]
        [TestCase(float.NaN)]
        [TestCase(float.PositiveInfinity)]
        public void InvalidEmoteSpeedsFailAtTheConfigurationBoundary(float speed)
        {
            var emote = CreateEmote();
            Set(emote, "playbackSpeed", speed);
            Assert.That(emote.ValidateConfiguration().Any(error => error.Setting == "playbackSpeed"), Is.True);
        }

        [TestCase(false)]
        [TestCase(true)]
        public void EmotePlaysItsOptionalSoundOnceIncludingWhenTheAnimationIsMissing(bool missingAnimation)
        {
            var manager = Game.Start<AudioTestSoundManager>();
            var sound = Game.Asset<SoundDefinition>();
            var clip = Game.Own(AudioClip.Create("Emote sound", 4410, 1, 44100, false));
            Set(sound, "soundId", "test:emote-sound");
            Set(sound, "clip", clip);
            var emote = CreateEmote();
            Set(emote, "sound", sound);
            Set(emote, "playbackSpeed", 0.5f);
            if (missingAnimation)
            {
                Set(_animation, "clip", null);
                Set(_animation, "memaoAction", "MissingEmoteAnimation");
                LogAssert.Expect(LogType.Warning, new System.Text.RegularExpressions.Regex("Emote 'test:reaction'.*has no animation"));
            }
            Assert.That(emote.ValidateConfiguration(), Is.Empty);
            using var action = new EmoteAction(_actor, emote);
            action.Tick(0.1f);
            action.Tick(0.1f);
            Assert.That(manager.Calls, Is.EqualTo(1));
            Assert.That(manager.Clip, Is.SameAs(clip));
            Assert.That(manager.Options.MmSoundManagerTrack, Is.EqualTo(MMSoundManager.MMSoundManagerTracks.Sfx));
            Assert.That(manager.Options.Location, Is.EqualTo(_actor.Graphics.position));
            Assert.That(manager.Options.SpatialBlend, Is.EqualTo(1f));
            Assert.That(manager.Options.Loop, Is.False);
            Assert.That(manager.Options.Pitch, Is.EqualTo(1f));
        }

        [Test]
        public void InvalidOptionalSoundFailsAtTheConfigurationBoundary()
        {
            var emote = CreateEmote();
            var sound = Game.Asset<SoundDefinition>();
            Set(sound, "soundId", "test:emote-sound");
            Set(emote, "sound", sound);
            Assert.That(emote.ValidateConfiguration().Any(error => error.Setting == "sound.clip"), Is.True);
        }

        [Test]
        public void ReplacingAnEmoteDoesNotLetItsCleanupStopTheNewAnimation()
        {
            using var action = new EmoteAction(_actor, CreateEmote());
            using var replacement = _actor.Animator.PlayOneShot(_animation);
            Assert.That(() => action.Tick(0), Throws.InvalidOperationException.With.Message.Contains("interrupted"));
            action.Dispose();
            Assert.That(replacement.IsInterrupted, Is.False);
        }

        [Test]
        public void InvalidEmoteDefinitionsFailAtTheConfigurationBoundary()
        {
            var emote = CreateEmote();
            Assert.That(emote.ValidateConfiguration(), Is.Empty);
            Set(emote, "duration", float.NaN);
            Assert.That(emote.ValidateConfiguration().Any(error => error.Setting == "duration"), Is.True);
            Set(emote, "duration", 1f);
            Set(emote, "animation", null);
            Assert.That(emote.ValidateConfiguration().Any(error => error.Setting == "animation"), Is.True);
        }

        [Test]
        public void EmoteExportsAsAnAwaitableCharacterAction()
        {
            var method = VulcanusLuaEngine.DescribeBindings().modules.Single(module => module.path == "Characters")
                .methods.Single(method => method.action.id == "characters.emote");
            Assert.That(method.action.execution, Is.EqualTo("awaitable"));
            Assert.That(method.parameters.Single(parameter => parameter.name == "emote").resourceType, Is.EqualTo("emote"));
            var source = JArray.Parse("[{'id':'react','action':'characters.emote','arguments':{'character':'player','emote':'test:reaction'}}]");
            Assert.That(method.parameters.Single(parameter => parameter.name == "pauseAfterSeconds").defaultValue, Is.EqualTo(1d));
            Assert.That(CutsceneSequenceCompiler.Compile(source, "emote.json"), Does.Contain("Characters.Emote(\"player\", \"test:reaction\", 0, 1)"));
            source[0]["arguments"]["durationSeconds"] = 2.5;
            Assert.That(CutsceneSequenceCompiler.Compile(source, "emote.json"), Does.Contain("Characters.Emote(\"player\", \"test:reaction\", 2.5, 1)"));
            source[0]["arguments"]["pauseAfterSeconds"] = 0;
            Assert.That(CutsceneSequenceCompiler.Compile(source, "emote.json"), Does.Contain("Characters.Emote(\"player\", \"test:reaction\", 2.5, 0)"));
        }

        private EmoteDefinition CreateEmote()
        {
            var emote = Game.Asset<EmoteDefinition>();
            Set(emote, "emoteId", "test:reaction");
            Set(emote, "duration", 1f);
            Set(emote, "animation", _animation);
            return emote;
        }

        private void AdvanceAnimation(float seconds)
        {
            var animancer = _actor.GetComponentInChildren<NamedAnimancerComponent>(true);
            animancer.Evaluate(); // Apply the queued playback start before advancing the native graph.
            animancer.Evaluate(seconds);
        }

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
