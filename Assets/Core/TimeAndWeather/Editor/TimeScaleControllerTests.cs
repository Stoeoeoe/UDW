using System;
using System.Reflection;
using Core.Common.Editor;
using MoreMountains.Feedbacks;
using MoreMountains.Tools;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.TimeAndWeather.Editor
{
    /// <summary>Exercises the actual feedback events, overlapping request lifetimes and time-step restoration.</summary>
    public sealed class TimeScaleControllerTests
    {
        private GameObject _root;
        private TimeScaleController _controller;
        private float _scale, _fixed, _maximum;
        private static readonly MMTweenType Linear = new(AnimationCurve.Linear(0, 0, 1, 1));

        [SetUp]
        public void SetUp()
        {
            _scale = Time.timeScale;
            _fixed = Time.fixedDeltaTime;
            _maximum = Time.maximumDeltaTime;
            _root = new GameObject("Time scale test");
            _root.SetActive(false);
            _controller = _root.AddComponent<TimeScaleController>();
            GameTestFixture.Invoke(_controller, "Awake");
            GameTestFixture.Invoke(_controller, "OnEnable");
        }

        [TearDown]
        public void TearDown()
        {
            GameTestFixture.Invoke(_controller, "OnDisable");
            Object.DestroyImmediate(_root);
            Time.timeScale = _scale;
            Time.fixedDeltaTime = _fixed;
            Time.maximumDeltaTime = _maximum;
        }

        [Test]
        public void TimedSlowMotionScalesPhysicsAndRestoresNormalTime()
        {
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.5f, 1f, false, 0f, false);
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            Assert.That(Time.fixedDeltaTime, Is.EqualTo(_fixed * 0.5f).Within(0.0001f));
            Assert.That(Time.maximumDeltaTime, Is.EqualTo(_maximum * 0.5f).Within(0.0001f));
            Advance(1f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
            Assert.That(Time.fixedDeltaTime, Is.EqualTo(_fixed).Within(0.0001f));
            Assert.That(Time.maximumDeltaTime, Is.EqualTo(_maximum).Within(0.0001f));
        }

        [Test]
        public void FreezeFrameSuspendsTheUnderlyingRequestAndKeepsPhysicsStepsPositive()
        {
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.5f, 1f, false, 0f, false);
            Advance(0.1f);
            MMFreezeFrameEvent.Trigger(0.2f);
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.Zero);
            Assert.That(Time.fixedDeltaTime, Is.GreaterThan(0));
            Assert.That(Time.maximumDeltaTime, Is.GreaterThan(0));
            Advance(0.11f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            Advance(0.89f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            Advance(0.02f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
        }

        [Test]
        public void UnfreezeReleasesOnlyTheTopRequestWhileResetClearsAllRequests()
        {
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.5f, 0f, false, 0f, true);
            Advance(0.1f);
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.25f, 0f, false, 0f, true);
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.EqualTo(0.25f));
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.Unfreeze, 1f, 0f, false, 0f, false);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.Reset, 1f, 0f, false, 0f, false);
            Advance(10f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
        }

        [Test]
        public void DurationInterpolationReachesItsTargetAndReturnsToNormal()
        {
            DurationRequest(0.2f, 0f, 1f);
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(0.6f).Within(0.0001f));
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(0.2f).Within(0.0001f));
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(0.6f).Within(0.0001f));
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
        }

        [Test]
        public void ANewEffectReplacesAnInProgressReturnToNormal()
        {
            DurationRequest(0.2f, 0f, 1f);
            Advance(1f);
            Advance(0.25f);
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.5f, 0.2f, false, 0f, false);
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            Advance(0.2f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
        }

        [Test]
        public void SpeedInterpolationUsesUnscaledTime()
        {
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0f, 0f, true, 1f, true);
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
            Advance(0.5f);
            Assert.That(Time.timeScale, Is.EqualTo(0.25f));
        }

        [Test]
        public void MissingDurationCurveFailsBeforeChangingTheActiveEffect()
        {
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.5f, 0f, false, 0f, true);
            Advance(0.1f);
            Assert.Throws<ArgumentException>(() =>
                MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, 0.25f, 1f, true, 0f, false,
                    MMTimeScaleLerpModes.Duration, null, 1f, false, null, 0f));
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.EqualTo(0.5f));
        }

        [Test]
        public void DisablingRestoresNormalTimeAndUnsubscribesFromFeedbackEvents()
        {
            MMFreezeFrameEvent.Trigger(1f);
            Advance(0.1f);
            GameTestFixture.Invoke(_controller, "OnDisable");
            Assert.That(Time.timeScale, Is.EqualTo(1f));
            MMFreezeFrameEvent.Trigger(1f);
            Advance(0.1f);
            Assert.That(Time.timeScale, Is.EqualTo(1f));
        }

        private static void DurationRequest(float scale, float hold, float duration) =>
            MMTimeScaleEvent.Trigger(MMTimeScaleMethods.For, scale, hold, true, 0f, false,
                MMTimeScaleLerpModes.Duration, Linear, duration, true, Linear, duration);

        private void Advance(float deltaTime) =>
            typeof(TimeScaleController).GetMethod("Advance", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(_controller, new object[] { deltaTime });
    }
}
