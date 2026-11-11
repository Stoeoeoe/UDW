using System;
using System.Reflection;
using Animancer;
using Character.Animations;
using Core.Common.Editor;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using static Core.Common.Editor.Reflect;

namespace Character.Editor
{
    public sealed class ActivityAnimationTests : GameTest
    {
        private MainCharacter _actor;
        private CharacterAnimation _start;
        private CharacterAnimation _loop;
        private CharacterAnimation _end;

        [SetUp]
        public void SetUp()
        {
            _actor = Game.CreateAnimatedCharacter();
            _start = CreateAnimation("test:sit-down", looping: false);
            _loop = CreateAnimation("test:read", looping: true);
            _end = CreateAnimation("test:stand-up", looping: false);
        }

        [TearDown]
        public void TearDown()
        {
            if (_actor) _actor.Animator.EndInteractionAnimation();
        }

        [Test]
        public void PlaysTheStartThenHoldsTheLoopUntilTheEndIsRequested()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(_start, _loop, _end));
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Starting));
            Assert.That(CurrentState().Clip, Is.SameAs(_start.Clip));

            FinishCurrentClip();
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Looping));
            Assert.That(CurrentState().Clip, Is.SameAs(_loop.Clip));

            // The loop is held however long the activity lasts.
            AdvanceAnimation(_loop.Clip.length * 5);
            Update();
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Looping));

            playback.RequestEnd();
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Ending));
            Assert.That(CurrentState().Clip, Is.SameAs(_end.Clip));
            Assert.That(playback.IsCompleted, Is.False);

            FinishCurrentClip();
            Assert.That(playback.IsCompleted, Is.True);
            Assert.That(playback.IsInterrupted, Is.False);
            Assert.That(CurrentState(), Is.Null, "A completed activity returns the character to locomotion.");
            playback.Dispose();
        }

        [Test]
        public void AFiniteLoopClipRepeatsUntilTheEndIsRequested()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(null, _start, _end));
            var state = CurrentState();
            Assert.That(state.Clip, Is.SameAs(_start.Clip));
            Assert.That(state.Clip.isLooping, Is.False);

            FinishCurrentClip();
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Looping));
            Assert.That(CurrentState(), Is.SameAs(state));
            Assert.That(state.NormalizedTime, Is.LessThan(1f), "The finished loop clip starts again.");
            Assert.That(state.IsPlaying, Is.True);

            playback.RequestEnd();
            Assert.That(CurrentState().Clip, Is.SameAs(_end.Clip));
        }

        [Test]
        public void WithoutStartOrEndItLoopsImmediatelyAndEndsAtOnce()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(null, _loop, null));
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Looping));
            Assert.That(CurrentState().Clip, Is.SameAs(_loop.Clip));

            playback.RequestEnd();
            Assert.That(playback.IsCompleted, Is.True);
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void EndingDuringTheStartSkipsStraightToTheEnd()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(_start, _loop, _end));
            playback.RequestEnd();
            Assert.That(playback.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Ending));
            Assert.That(CurrentState().Clip, Is.SameAs(_end.Clip));
        }

        [Test]
        public void DisposingInterruptsWithoutTheEndAndPlayingAgainRestartsFromTheStart()
        {
            var activity = CreateActivity(_start, _loop, _end);
            var playback = _actor.Animator.PlayActivity(activity);
            FinishCurrentClip();

            playback.Dispose();
            Assert.That(CurrentState(), Is.Null, "An interruption releases the pose without playing the end.");

            using var resumed = _actor.Animator.PlayActivity(activity);
            Assert.That(resumed.Phase, Is.EqualTo(UrCharacterAnimator.ActivityPhase.Starting));
            Assert.That(CurrentState().Clip, Is.SameAs(_start.Clip));
            Assert.That(CurrentState().Time, Is.EqualTo(0));
        }

        [Test]
        public void AnotherAnimationInterruptsTheActivityAndItsStaleHandleCannotStopTheReplacement()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(_start, _loop, _end));
            FinishCurrentClip();

            using var gesture = _actor.Animator.PlayOneShot(_end);
            Assert.That(playback.IsInterrupted, Is.True);
            Assert.That(() => playback.RequestEnd(), Throws.InvalidOperationException);

            playback.Dispose();
            Update();
            Assert.That(gesture.IsInterrupted, Is.False);
            Assert.That(CurrentState().IsPlaying, Is.True);
        }

        [Test]
        public void ALocationChangeInterruptsTheActivity()
        {
            var playback = _actor.Animator.PlayActivity(CreateActivity(null, _loop, _end));
            _actor.Animator.OnLocationLeave(null);
            Assert.That(playback.IsInterrupted, Is.True);
            Assert.That(CurrentState(), Is.Null);
        }

        [Test]
        public void ActivitiesValidateTheirPhasesBeforeInterruptingTheCurrentPose()
        {
            Assert.That(CreateActivity(_start, _loop, _end).ValidateConfiguration(), Is.Empty);
            Assert.That(CreateActivity(_loop, _loop, null).ValidateConfiguration(), Is.Not.Empty, "A looping start never finishes.");
            Assert.That(CreateActivity(null, _loop, _loop).ValidateConfiguration(), Is.Not.Empty, "A looping end never finishes.");
            Assert.That(CreateActivity(null, CreateActivity(null, _loop, null), null).ValidateConfiguration(), Is.Not.Empty,
                "An activity cannot loop another activity.");
            Assert.That(CreateActivity(null, null, null).ValidateConfiguration(), Is.Not.Empty, "The loop is required.");

            using var current = _actor.Animator.PlayOneShot(_start);
            var state = CurrentState();
            Assert.That(() => _actor.Animator.PlayActivity(CreateActivity(null, _loop, _loop)), Throws.InvalidOperationException);
            Assert.That(CurrentState(), Is.SameAs(state));
            Assert.That(current.IsInterrupted, Is.False);
        }

        [Test]
        public void AnActivityOnEnterStartsWhenTheCharacterEntersALocation()
        {
            Set(_actor.Animator, "activityOnEnter", CreateActivity(_start, _loop, _end));
            _actor.Animator.OnLocationEnter(null);
            Assert.That(CurrentState().Clip, Is.SameAs(_start.Clip), "The activity replaces the idle pose played on entry.");
            FinishCurrentClip();
            Assert.That(CurrentState().Clip, Is.SameAs(_loop.Clip));

            Set(_actor.Animator, "activityOnEnter", CreateActivity(null, _loop, _loop));
            Assert.That(() => _actor.Animator.ValidateConfiguration(), Throws.InvalidOperationException);
        }

        [Test]
        public void ActivitiesAreNotPlayedAsPlainInteractionAnimations()
        {
            var activity = CreateActivity(_start, _loop, _end);
            Assert.That(() => _actor.Animator.PlayInteractionAnimation(activity),
                Throws.InvalidOperationException.With.Message.Contains("PlayActivity"));
        }

        private CharacterActivityAnimation CreateActivity(CharacterAnimation start, CharacterAnimationDefinition loop,
            CharacterAnimation end)
        {
            var activity = Game.Asset<CharacterActivityAnimation>();
            activity.name = "test:activity";
            Set(activity, "animationId", "test:activity");
            Set(activity, "start", start);
            Set(activity, "loop", loop);
            Set(activity, "end", end);
            return activity;
        }

        private CharacterAnimation CreateAnimation(string id, bool looping)
        {
            var clip = Game.Own(new AnimationClip { name = id });
            AnimationUtility.SetEditorCurve(clip, EditorCurveBinding.FloatCurve("", typeof(Transform), "m_LocalScale.z"),
                AnimationCurve.Linear(0, 1, 1, 2));
            var settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = looping;
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            var animation = Game.Asset<CharacterAnimation>();
            animation.name = id;
            Set(animation, "animationId", id);
            Set(animation, "clip", clip);
            return animation;
        }

        private void FinishCurrentClip()
        {
            AdvanceAnimation(CurrentState().Length + 0.01f);
            Update();
        }

        private void Update() => GameTestFixture.Invoke(_actor.Animator, "Update");

        private void AdvanceAnimation(float seconds)
        {
            var animancer = _actor.GetComponentInChildren<NamedAnimancerComponent>(true);
            animancer.Evaluate(); // Apply the queued playback start before advancing the native graph.
            animancer.Evaluate(seconds);
        }

        private AnimancerState CurrentState() => (AnimancerState)typeof(UrCharacterAnimator)
            .GetField("_interactionState", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_actor.Animator);
    }
}
