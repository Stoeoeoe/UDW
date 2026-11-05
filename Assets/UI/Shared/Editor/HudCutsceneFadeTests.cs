using System;
using System.Reflection;
using Core.Common.Editor;
using Core.Context;
using Core.Location;
using DG.Tweening;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;
using static Core.Common.Editor.Reflect;
using Image = UnityEngine.UI.Image;

namespace UI.Shared.Editor
{
    public sealed class HudCutsceneFadeTests : GameTest
    {

        private UrGUIManager _gui;
        private VisualElement _hud;
        private CanvasGroup _hotbar;

        [SetUp]
        public void SetUp()
        {

            Game.Root.SetActive(true);
            UIScreenPauseTests.CreateScreenServices(Game);
            Game.Get<PlayerInteractionContext>();
            _gui = Game.Get<UrGUIManager>();
            _gui.gameObject.SetActive(true);
            var document = _gui.GetComponent<UIDocument>();
            document.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset");
            document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Hud/GameHud.uxml");
            var panel = new GameObject("Fader", typeof(RectTransform), typeof(CanvasGroup), typeof(Image), typeof(ScreenFader));
            panel.transform.SetParent(Game.Root.transform, false);
            var fader = panel.GetComponent<ScreenFader>();
            GameTestFixture.Invoke(fader, "Awake");
            Set(_gui, "screenFader", fader);
            var hotbar = new GameObject("Hotbar", typeof(CanvasGroup));
            hotbar.transform.SetParent(Game.Root.transform, false);
            _hotbar = hotbar.GetComponent<CanvasGroup>();
            Set(_gui, "toolHud", _hotbar);
            GameTestFixture.Invoke(_gui, "Start");
            _hud = document.rootVisualElement.Q("gameHud");
        }

        [TearDown]
        public void TearDown()
        {
            GameTestFixture.Invoke(_gui, "OnDisable");

        }

        [Test]
        public void ActivationFadesOutAndFinishingFadesIn()
        {
            SetActive(true);
            Assert.That(_hotbar.interactable, Is.False);
            Assert.That(_hotbar.blocksRaycasts, Is.False);
            Fade.Goto(0.5f);
            Assert.That(_hud.style.opacity.value, Is.EqualTo(0.5f).Within(0.01f));
            Assert.That(_hotbar.alpha, Is.EqualTo(0.5f).Within(0.01f));
            Fade.Complete();
            Assert.That(_hud.style.opacity.value, Is.Zero);
            SetActive(false);
            Assert.That(_hotbar.interactable, Is.True);
            Fade.Goto(0.5f);
            Assert.That(_hud.style.opacity.value, Is.EqualTo(0.5f).Within(0.01f));
            Fade.Complete();
            Assert.That(_hud.style.opacity.value, Is.EqualTo(1));
        }

        [Test]
        public void EarlyFinishAndAnotherCutsceneReplaceThePreviousFade()
        {
            SetActive(true);
            var entrance = Fade;
            entrance.Goto(0.5f);
            SetActive(false);
            Fade.Goto(0.5f);
            Assert.That(_hud.style.opacity.value, Is.EqualTo(0.75f).Within(0.01f));
            SetActive(true);
            Fade.Complete();
            Assert.That(_hud.style.opacity.value, Is.Zero);
        }

        [Test]
        public void ZeroDurationAndInterruptedPresentationRestoreVisibility()
        {
            SetActive(true, 0);
            Assert.That(_hud.style.opacity.value, Is.Zero);
            SetActive(false, 0);
            Assert.That(_hud.style.opacity.value, Is.EqualTo(1));
            Assert.That(_hotbar.alpha, Is.EqualTo(1));
            SetActive(true);
            Fade.Complete();
            _gui.TransitionInterrupted += () => SetActive(false);
            GameTestFixture.Invoke(_gui, "OnDisable");
            Assert.That(_hud.style.opacity.value, Is.EqualTo(1));
            Assert.That(Fade, Is.Null);
        }

        [Test]
        public void MissingHudFailsAtInitialization()
        {
            _hud.RemoveFromHierarchy();
            Assert.That(() => GameTestFixture.Invoke(_gui, "Start"), Throws.TypeOf<InvalidOperationException>().With.Message.Contains("gameHud"));
        }

        [Test]
        public void MissingHotbarFailsAtInitialization()
        {
            Set(_gui, "toolHud", null);
            Assert.That(() => GameTestFixture.Invoke(_gui, "Start"), Throws.TypeOf<InvalidOperationException>().With.Message.Contains("hotbar"));
        }

        private Tween Fade => (Tween)typeof(UrGUIManager).GetField("_hudTween", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(_gui);
        private void SetActive(bool active, float seconds = 1f) => typeof(UrGUIManager)
            .GetMethod("SetCutsceneActive", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).Invoke(_gui, new object[] { active, seconds });
    }
}
