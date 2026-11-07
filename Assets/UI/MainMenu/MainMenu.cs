using System;
using System.Linq;
using Core;
using Core.Game;
using Core.Location;
using UI.Shared;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;
#if UNITY_EDITOR
using EditorApplication = UnityEditor.EditorApplication;
#endif

namespace UI.MainMenu
{
    /// <summary>
    /// The title screen that plays before the game: continue, start a new game or load / delete a save. It runs in its
    /// own scene without the game's services, so it reads the save folder directly and hands its choice to
    /// <see cref="GameStartRequest"/> before loading the game scene.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class MainMenu : MonoBehaviour
    {
        private GameSaveService _saves;
        private GameStateManager _game;
        private LevelManager _level;
        private VisualElement _titleView;
        private VisualElement _newGameView;
        private VisualElement _loadView;
        private VisualElement _settingsView;
        private SettingsPage _settings;
        private Button _continueButton;
        private Button _startButton;
        private TextField _saveName;
        private ScrollView _slotList;
        private Label _noSaves;
        private bool _starting;

        private void Start()
        {
            // The game's persistent systems already run behind the menu; the menu only picks the session.
            var container = LifetimeScope.Find<SystemRoot>().Container;
            _saves = container.Resolve<GameSaveService>();
            _game = container.Resolve<GameStateManager>();
            _level = container.Resolve<LevelManager>();

            var root = GetComponent<UIDocument>().rootVisualElement;
            root.Q("menuRoot").parent.style.flexGrow = 1; // The template container must fill the screen for centering.
            _titleView = root.Q("titleView");
            _newGameView = root.Q("newGameView");
            _loadView = root.Q("loadView");
            _settingsView = root.Q("settingsView");
            _settings = new SettingsPage(_settingsView);
            _continueButton = root.Q<Button>("continueButton");
            _startButton = root.Q<Button>("startButton");
            _saveName = root.Q<TextField>("saveNameField");
            _slotList = root.Q<ScrollView>("slotList");
            _noSaves = root.Q<Label>("noSavesLabel");

            _continueButton.clicked += () => Begin(() =>
            {
                if (!_game.Continue()) throw new InvalidOperationException("Continue needs a readable save.");
            });
            root.Q<Button>("newGameButton").clicked += ShowNewGame;
            root.Q<Button>("loadGameButton").clicked += ShowLoad;
            root.Q<Button>("settingsButton").clicked += ShowSettings;
            root.Q<Button>("settingsBackButton").clicked += () =>
            {
                _settings.Save();
                ShowTitle();
            };
            root.Q<Button>("quitButton").clicked += Quit;
            _startButton.clicked += () => Begin(() => _game.NewGame(_saveName.value.Trim()));
            _startButton.AddToClassList("is-primary");
            root.Q<Button>("newGameBackButton").clicked += ShowTitle;
            root.Q<Button>("loadBackButton").clicked += ShowTitle;
            _saveName.RegisterValueChangedCallback(_ => _startButton.SetEnabled(HasSaveName));
            _saveName.RegisterCallback<KeyDownEvent>(e =>
            {
                if ((e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter) && HasSaveName) _startButton.Focus();
            });

            ShowTitle();
        }

        private bool HasSaveName => !string.IsNullOrWhiteSpace(_saveName.value);

        private void Show(VisualElement view)
        {
            foreach (var each in new[] { _titleView, _newGameView, _loadView, _settingsView })
                each.EnableInClassList("is-shown", each == view);
        }

        private void ShowTitle()
        {
            Show(_titleView);
            var hasSave = SaveSlotInfo.LastPlayed(_saves.ListSlots()) != null;
            _continueButton.SetEnabled(hasSave);
            (hasSave ? _continueButton : _titleView.Q<Button>("newGameButton")).Focus();
        }

        private void ShowNewGame()
        {
            Show(_newGameView);
            _saveName.value = "";
            _startButton.SetEnabled(false);
            _saveName.Focus();
        }

        private void ShowLoad()
        {
            Show(_loadView);
            RefreshSlots();
        }

        private void ShowSettings()
        {
            Show(_settingsView);
            _settings.Show();
            _settingsView.Q<Slider>("masterVolume").Focus();
        }

        private void RefreshSlots()
        {
            _slotList.Clear();
            var slots = _saves.ListSlots()
                .OrderByDescending(slot => slot.IsReadable)
                .ThenByDescending(slot => slot.Header?.savedAtUtcTicks ?? 0)
                .ToList();
            _noSaves.style.display = slots.Count == 0 ? DisplayStyle.Flex : DisplayStyle.None;
            foreach (var slot in slots) _slotList.Add(BuildRow(slot));
            _slotList.Q<Button>()?.Focus();
        }

        private VisualElement BuildRow(SaveSlotInfo slot)
        {
            var row = new VisualElement();
            row.AddToClassList("main-menu-slot");
            if (!slot.IsReadable) row.AddToClassList("main-menu-slot-error");

            var info = new VisualElement();
            info.AddToClassList("main-menu-slot-info");
            info.Add(Label(slot.DisplayName, "main-menu-slot-name"));
            info.Add(Label(Describe(slot), "main-menu-slot-detail"));
            row.Add(info);

            var actions = new VisualElement();
            actions.AddToClassList("main-menu-slot-actions");
            row.Add(actions);
            ShowRowActions(row, actions, slot);
            return row;
        }

        private void ShowRowActions(VisualElement row, VisualElement actions, SaveSlotInfo slot)
        {
            actions.Clear();
            if (slot.IsReadable)
            {
                var load = ActionButton("Load", () => Begin(() =>
                {
                    if (!_game.Load(slot.Slot)) throw new InvalidOperationException($"Slot '{slot.Slot}' no longer exists.");
                }));
                load.AddToClassList("is-primary");
                actions.Add(load);
            }
            actions.Add(ActionButton("Delete", () => ConfirmDelete(row, actions, slot)));
        }

        private void ConfirmDelete(VisualElement row, VisualElement actions, SaveSlotInfo slot)
        {
            actions.Clear();
            var yes = ActionButton("Delete", () =>
            {
                _saves.Delete(slot.Slot);
                RefreshSlots();
            });
            yes.AddToClassList("is-danger");
            actions.Add(yes);
            var keep = ActionButton("Keep", () => ShowRowActions(row, actions, slot));
            actions.Add(keep);
            keep.Focus(); // Focus lands on the safe choice.
        }

        private static Button ActionButton(string text, Action onClick)
        {
            var button = new Button(onClick) { text = text };
            button.AddToClassList("main-menu-button");
            return button;
        }

        private static Label Label(string text, string className)
        {
            var label = new Label(text);
            label.AddToClassList(className);
            return label;
        }

        private static string Describe(SaveSlotInfo slot)
        {
            if (!slot.IsReadable) return $"Cannot be loaded: {slot.Error}";
            var h = slot.Header;
            return $"{h.season} {h.dayOfSeason}, day {h.daysSinceStart}, {h.hour:00}:{h.minute:00} · {h.locationId}" +
                   $" · saved {h.SavedAtUtc.ToLocalTime():g}";
        }

        // A second click while the game scene loads must do nothing.
        private void Begin(Action chooseSession)
        {
            if (_starting) return;
            chooseSession(); // Throws, leaving the menu usable, when the session cannot be started.
            _starting = true;
            _level.BeginGame();
        }

        private static void Quit()
        {
#if UNITY_EDITOR
            EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }
    }
}
