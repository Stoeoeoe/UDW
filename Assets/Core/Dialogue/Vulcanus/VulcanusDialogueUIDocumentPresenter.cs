using System;
using System.Collections.Generic;
using System.Threading;
using Interaction.Dialog;
using MoreMountains.Tools;
using UI.Shared;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using Random = UnityEngine.Random;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Presents dialogue lines, typewriter text and choices as a managed UI Toolkit screen.</summary>
    [RequireComponent(typeof(UIDocument))]
    public class VulcanusDialogueUIDocumentPresenter : ManagedUIScreen, IDialoguePresenter, IDialogueAdvanceHandler
    {
        [Inject] private TypewriterSoundResolver _typewriterSoundResolver;

        [Inject] private CharacterManager _characterManager;

        [Inject] private Character.CharacterCatalog _characters;

        [Header("Layout")]
        [SerializeField] private UIDocument document;
        [SerializeField] private VisualTreeAsset layoutAsset;
        [SerializeField] private StyleSheet styleSheet;

        [Header("Behavior")]
        [SerializeField] private string continueButtonText = "Continue";
        [SerializeField] private string choicePromptText = "Choose a response";
        [SerializeField, Min(0)] private float charactersPerSecond = 48f;
        [SerializeField] private TypewriterSound defaultTypewriterSound;

        private VisualElement _overlay;
        private VisualElement _anchor;
        private VisualElement _panel;
        private Label _speakerLabel;
        private VisualElement _portrait;
        private Label _bodyLabel;
        private Label _hintLabel;
        private VisualElement _choiceContainer;
        private ScrollView _content;
        private Button _continueButton;
        private bool _isBuilt;
        private VisualElement _boundRoot;
        private bool _isTyping;
        private bool _waitingForAdvance;
        private bool _waitingForChoice;
        private string _lineText = string.Empty;
        private AwaitableCompletionSource _advance;
        private AwaitableCompletionSource<VulcanusDialogueChoiceOption> _choice;
        private readonly List<VulcanusDialogueChoiceOption> _visibleOptions = new();

        public event Action Dismissed;

        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            EnsureBuilt();
            _anchor.RemoveFromClassList("is-top");
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(string.Empty);
            SetHint(string.Empty);
            ClearChoices();
            SetContinueVisible(false);
        }

        public async Awaitable PresentLine(VulcanusDialogueLineNode node, string localizedText,
            VulcanusDialogueExecutionContext context, CancellationToken cancellation)
        {
            EnsureBuilt();
            UpdatePlacement();
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(node.Speaker, node.Emotion);
            SetBody(string.Empty);
            ClearChoices();
            SetContinueVisible(true);

            var advance = _advance = new AwaitableCompletionSource();
            _waitingForAdvance = true;
            FocusOverlay();
            _lineText = localizedText;
            _isTyping = true;
            await Type(node.Speaker, node.Emotion, cancellation);
            await DialogueWait.For(advance, cancellation);
        }

        // The first continue press reveals the rest of the line at once by ending the typing state.
        private async Awaitable Type(string speaker, string emotion, CancellationToken cancellation)
        {
            var text = _lineText;
            var sound = _typewriterSoundResolver.ResolveTypewriterSound(speaker, emotion, defaultTypewriterSound);
            var revealed = 0;
            var elapsed = 0f;
            while (_isTyping && revealed < text.Length && charactersPerSecond > 0f)
            {
                if (!ReceivesInput || Time.timeScale == 0f) { await Awaitable.NextFrameAsync(cancellation); continue; }
                elapsed += Time.unscaledDeltaTime * charactersPerSecond;
                while (elapsed >= 1f && revealed < text.Length)
                {
                    elapsed -= 1f;
                    var character = text[revealed++];
                    if (sound && sound.audioClips.Length > 0 && !char.IsWhiteSpace(character))
                        MMSoundManager.Current.PlaySound(
                            sound.audioClips[Random.Range(0, sound.audioClips.Length)],
                            MMSoundManager.MMSoundManagerTracks.Sfx, Vector3.zero,
                            pitch: Random.Range(sound.pitchMin, sound.pitchMax));
                }
                SetBody(text.Substring(0, revealed));
                await Awaitable.NextFrameAsync(cancellation);
            }
            SetBody(text);
            _isTyping = false;
        }

        public async Awaitable<VulcanusDialogueChoiceOption> PresentChoice(VulcanusDialogueChoiceNode node,
            IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context,
            CancellationToken cancellation)
        {
            EnsureBuilt();
            UpdatePlacement();
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(choicePromptText);
            SetHint("Click a choice or press 1-9");
            SetContinueVisible(false);

            var choice = _choice = new AwaitableCompletionSource<VulcanusDialogueChoiceOption>();
            _waitingForChoice = true;
            RebuildChoices(options, context);
            _choiceContainer[0].Focus();
            return await DialogueWait.For(choice, cancellation);
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            _isTyping = false;
            _waitingForAdvance = false;
            _waitingForChoice = false;
            _advance = null;
            _choice = null;
            ClearChoices();
            SetBody(string.Empty);
            SetHint(string.Empty);
            SetSpeaker(string.Empty, string.Empty);
            SetContinueVisible(false);
            CloseScreen();
        }

        public bool TryAdvanceDialogue()
        {
            if (!ReceivesInput) return false;
            if (!_isBuilt)
                EnsureBuilt();

            if (_waitingForAdvance)
            {
                ContinueRequested();
                return true;
            }

            return false;
        }

        private void Reset()
        {
            document = GetComponent<UIDocument>();
        }

        private void Awake()
        {
            EnsureBuilt();
            if (_overlay != null)
                _overlay.style.display = DisplayStyle.None;
        }

        private void OnEnable()
        {
            EnsureBuilt();
            if (_overlay != null) _overlay.style.display = DisplayStyle.None;
        }

        private void EnsureBuilt()
        {
            if (!document) document = GetComponent<UIDocument>();
            if (!document.isActiveAndEnabled) return; // UIDocument rebuilds its visual tree when enabled.
            var root = document.rootVisualElement;
            if (_isBuilt && ReferenceEquals(root, _boundRoot)) return;
            if (!layoutAsset || !styleSheet)
                throw new InvalidOperationException("Dialogue requires its UXML layout and stylesheet.");
            _boundRoot = root;
            root.style.flexGrow = 1;
            root.pickingMode = PickingMode.Ignore; // Only the visible overlay should intercept world clicks.
            root.Clear();
            root.styleSheets.Add(styleSheet);
            layoutAsset.CloneTree(root);
            BindElements(root);
            if (!ValidateBindings())
                throw new InvalidOperationException("Dialogue UXML is missing required named elements.");

            _overlay.focusable = true;
            _overlay.tabIndex = 0;
            _overlay.RegisterCallback<ClickEvent>(OnPointerDown);
            _overlay.RegisterCallback<KeyDownEvent>(OnKeyDown);
            _overlay.RegisterCallback<NavigationSubmitEvent>(evt =>
            {
                if (!_waitingForAdvance || IsButtonTarget(evt.target as VisualElement)) return;
                ContinueRequested();
                evt.StopPropagation();
            });
            _continueButton.clicked += ContinueRequested;

            RebindRoot(_overlay);
            _isBuilt = true;
        }

        private void OnPointerDown(ClickEvent evt)
        {
            if (_waitingForAdvance && !IsButtonTarget(evt.target as VisualElement))
            {
                ContinueRequested();
                evt.StopPropagation();
            }
        }

        private void OnKeyDown(KeyDownEvent evt)
        {
            if (!ReceivesInput) return;
            if (_waitingForAdvance && evt.keyCode == KeyCode.Space)
            {
                ContinueRequested();
                evt.StopPropagation();
                return;
            }

            if (!_waitingForChoice)
                return;

            var optionIndex = KeyCodeToOptionIndex(evt.keyCode);
            if (optionIndex < 0 || optionIndex >= _visibleOptions.Count)
                return;

            SelectOption(_visibleOptions[optionIndex]);
            evt.StopPropagation();
        }

        private static int KeyCodeToOptionIndex(KeyCode keyCode)
        {
            return keyCode switch
            {
                KeyCode.Alpha1 or KeyCode.Keypad1 => 0,
                KeyCode.Alpha2 or KeyCode.Keypad2 => 1,
                KeyCode.Alpha3 or KeyCode.Keypad3 => 2,
                KeyCode.Alpha4 or KeyCode.Keypad4 => 3,
                KeyCode.Alpha5 or KeyCode.Keypad5 => 4,
                KeyCode.Alpha6 or KeyCode.Keypad6 => 5,
                KeyCode.Alpha7 or KeyCode.Keypad7 => 6,
                KeyCode.Alpha8 or KeyCode.Keypad8 => 7,
                KeyCode.Alpha9 or KeyCode.Keypad9 => 8,
                _ => -1
            };
        }

        private void ContinueRequested()
        {
            if (!_waitingForAdvance || !ReceivesInput) return;
            PlayUISound(UISoundCue.Click);
            if (_isTyping)
            {
                _isTyping = false;
                SetBody(_lineText);
                return;
            }
            _waitingForAdvance = false;
            _advance.TrySetResult();
        }

        private void SelectOption(VulcanusDialogueChoiceOption option)
        {
            if (!_waitingForChoice || !ReceivesInput) return;
            PlayUISound(UISoundCue.Click);
            _waitingForChoice = false;
            _choice.TrySetResult(option);
        }

        protected override void OnScreenClosed() => Dismissed?.Invoke();

        private void RebuildChoices(IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context)
        {
            ClearChoices();
            for (var i = 0; i < options.Count; i++)
            {
                var option = options[i];
                _visibleOptions.Add(option);

                var index = i + 1;
                var text = context.CurrentDialogue.ResolveLocalizedText(option.MsgKey, option.Text);
                var button = new Button(() => SelectOption(option))
                {
                    text = $"{index}. {text}"
                };
                button.AddToClassList("dialogue-choice");
                button.focusable = true;
                _choiceContainer.Add(button);
            }
        }

        private void ClearChoices()
        {
            _visibleOptions.Clear();
            _choiceContainer.Clear();
            _content.scrollOffset = Vector2.zero;
        }

        private void UpdatePlacement()
        {
            var heroPosition = _characterManager.MainCharacter.transform.position;
            var viewportPosition = UnityEngine.Camera.main.WorldToViewportPoint(heroPosition);
            _anchor.EnableInClassList("is-top", viewportPosition.y < 0.5f);
        }

        private void SetSpeaker(string speaker, string emotion)
        {
            // An empty speaker is narration: no portrait or nameplate.
            var hasSpeaker = !string.IsNullOrWhiteSpace(speaker);
            var character = hasSpeaker ? _characters.Require(speaker) : null;
            var portrait = character ? character.PortraitFor(emotion) : null;

            _speakerLabel.text = character ? character.Name : string.Empty;
            _portrait.style.backgroundImage = portrait ? new StyleBackground(portrait) : StyleKeyword.None;
            _portrait.EnableInClassList("is-empty", !portrait);
            if (portrait) SizePortrait(portrait);
            _panel.EnableInClassList("has-speaker", hasSpeaker);
        }

        // Draw the portrait at a whole multiple of its pixels on screen; any other scale makes some pixels wider than others.
        private void SizePortrait(Texture2D portrait)
        {
            var scale = Mathf.Max(1, Mathf.RoundToInt(_panel.panel.scaledPixelsPerPoint));
            var pixelsPerPoint = _panel.panel.scaledPixelsPerPoint;
            _portrait.style.width = portrait.width * scale / pixelsPerPoint;
            _portrait.style.height = portrait.height * scale / pixelsPerPoint;
        }

        private void SetBody(string text)
        {
            _bodyLabel.text = text;
        }

        private void SetHint(string text)
        {
            _hintLabel.text = text;
        }

        private void SetContinueVisible(bool isVisible)
        {
            _continueButton.text = continueButtonText;
            _continueButton.style.display = isVisible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void FocusOverlay()
        {
            _overlay.Focus();
        }

        private void BindElements(VisualElement root)
        {
            _content = root.Q<ScrollView>("dialogue-content");
            _overlay = root.Q<VisualElement>("dialogue-overlay");
            _anchor = root.Q<VisualElement>("dialogue-anchor");
            _panel = root.Q<VisualElement>("dialogue-panel");
            _speakerLabel = root.Q<Label>("dialogue-speaker");
            _portrait = root.Q<VisualElement>("dialogue-portrait");
            _bodyLabel = root.Q<Label>("dialogue-body");
            _hintLabel = root.Q<Label>("dialogue-hint");
            _choiceContainer = root.Q<VisualElement>("dialogue-choices");
            _continueButton = root.Q<Button>("dialogue-continue");
        }

        private bool ValidateBindings()
        {
            return _content != null && _overlay != null && _anchor != null &&
                   _panel != null &&
                   _bodyLabel != null &&
                   _hintLabel != null &&
                   _choiceContainer != null &&
                   _continueButton != null &&
                   _speakerLabel != null &&
                   _portrait != null;
        }

        private static bool IsButtonTarget(VisualElement target)
        {
            var current = target;
            while (current != null)
            {
                if (current is Button || current is Scroller)
                    return true;

                current = current.parent;
            }

            return false;
        }

    }
}
