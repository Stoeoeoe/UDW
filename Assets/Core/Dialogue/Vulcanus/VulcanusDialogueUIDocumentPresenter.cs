using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using UI.Shared;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Presents dialogue lines, typewriter text and choices as a managed UI Toolkit screen.</summary>
    [RequireComponent(typeof(UIDocument))]
    public class VulcanusDialogueUIDocumentPresenter : ManagedUIScreen, IDialoguePresenter, IDialogueAdvanceHandler
    {
        [Header("Layout")]
        [SerializeField] private UIDocument document;
        [SerializeField] private VisualTreeAsset layoutAsset;
        [SerializeField] private StyleSheet styleSheet;

        [Header("Behavior")]
        [SerializeField] private string continueButtonText = "Continue";
        [SerializeField] private string choicePromptText = "Choose a response";
        [SerializeField, Min(0)] private float charactersPerSecond = 48f;
        [SerializeField] private Interaction.Dialog.TypewriterSound defaultTypewriterSound;

        private VisualElement _overlay;
        private VisualElement _panel;
        private Label _speakerLabel;
        private Label _emotionLabel;
        private Label _bodyLabel;
        private Label _hintLabel;
        private VisualElement _choiceContainer;
        private ScrollView _content;
        private Button _continueButton;
        private bool _isBuilt;
        private VisualElement _boundRoot;
        private bool _isTyping;
        private bool _revealRequested;
        private bool _waitingForAdvance;
        private bool _waitingForChoice;
        private VulcanusDialogueChoiceOption _selectedOption;
        private readonly List<VulcanusDialogueChoiceOption> _visibleOptions = new();

        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            EnsureBuilt();
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(string.Empty);
            SetHint(string.Empty);
            ClearChoices();
            SetContinueVisible(false);
        }

        public IEnumerator PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context)
        {
            EnsureBuilt();
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(node.Speaker, node.Emotion);
            SetBody(string.Empty);
            SetHint("Click, Enter or Space to continue; Esc to close");
            ClearChoices();
            SetContinueVisible(true);

            _waitingForAdvance = true;
            FocusOverlay();
            _isTyping = true;
            _revealRequested = false;
            var sound = Interaction.Dialog.TypewriterSoundResolver.ResolveTypewriterSound(node.Speaker, defaultTypewriterSound);
            var revealed = 0;
            var elapsed = 0f;
            while (revealed < localizedText.Length && !_revealRequested && charactersPerSecond > 0f)
            {
                elapsed += Time.unscaledDeltaTime * charactersPerSecond;
                while (elapsed >= 1f && revealed < localizedText.Length)
                {
                    elapsed -= 1f;
                    var character = localizedText[revealed++];
                    if (sound && sound.audioClips.Length > 0 && !char.IsWhiteSpace(character))
                        MoreMountains.Tools.MMSoundManager.Current.PlaySound(
                            sound.audioClips[UnityEngine.Random.Range(0, sound.audioClips.Length)],
                            MoreMountains.Tools.MMSoundManager.MMSoundManagerTracks.Sfx, Vector3.zero,
                            pitch: UnityEngine.Random.Range(sound.pitchMin, sound.pitchMax));
                }
                SetBody(localizedText.Substring(0, revealed));
                yield return null;
            }
            SetBody(localizedText);
            _isTyping = false;
            yield return new WaitUntil(() => !_waitingForAdvance);
        }

        public IEnumerator PresentChoice(VulcanusDialogueChoiceNode node, IReadOnlyList<VulcanusDialogueChoiceOption> options,
            VulcanusDialogueExecutionContext context, Action<VulcanusDialogueChoiceOption> onSelected)
        {
            EnsureBuilt();
            OpenScreen(context.Instigator, context.PauseWhileOpen);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(choicePromptText);
            SetHint("Click a choice or press 1-9");
            SetContinueVisible(false);

            _waitingForChoice = true;
            _selectedOption = null;
            RebuildChoices(options, context);
            _choiceContainer[0].Focus();
            yield return new WaitUntil(() => !_waitingForChoice);

            onSelected?.Invoke(_selectedOption);
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            _isTyping = false;
            _revealRequested = false;
            _waitingForAdvance = false;
            _waitingForChoice = false;
            _selectedOption = null;
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
            _overlay.RegisterCallback<NavigationCancelEvent>(evt =>
            {
                if (!ReceivesInput) return;
                VulcanusDialogueRunner.Instance.CancelDialogue();
                evt.StopPropagation();
            });

            _overlay.RegisterCallback<NavigationSubmitEvent>(evt =>
            {
                if (!_waitingForAdvance || IsButtonTarget(evt.target as VisualElement)) return;
                ContinueRequested();
                evt.StopPropagation();
            });
            _continueButton.clicked += ContinueRequested;
            root.Q<Button>("dialogue-close").clicked += () => VulcanusDialogueRunner.Instance.CancelDialogue();

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
            if (evt.keyCode == KeyCode.Escape)
            {
                VulcanusDialogueRunner.Instance.CancelDialogue();
                evt.StopPropagation();
                return;
            }
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
            if (_isTyping) _revealRequested = true;
            else _waitingForAdvance = false;
        }

        private void SelectOption(VulcanusDialogueChoiceOption option)
        {
            if (!_waitingForChoice || !ReceivesInput) return;
            PlayUISound(UISoundCue.Click);
            _selectedOption = option;
            _waitingForChoice = false;
        }

        protected override void OnScreenClosed() => VulcanusDialogueRunner.Instance.CancelDialogue();

        private void RebuildChoices(IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context)
        {
            ClearChoices();
            if (_choiceContainer == null)
                return;

            for (var i = 0; i < options.Count; i++)
            {
                var option = options[i];
                if (option == null)
                    continue;

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
            _choiceContainer?.Clear();
            _content.scrollOffset = Vector2.zero;
        }

        private void SetSpeaker(string speaker, string emotion)
        {
            if (_speakerLabel != null)
            {
                _speakerLabel.text = string.IsNullOrWhiteSpace(speaker) ? string.Empty : speaker;
                _speakerLabel.style.display = string.IsNullOrWhiteSpace(speaker) ? DisplayStyle.None : DisplayStyle.Flex;
            }

            if (_emotionLabel != null)
            {
                _emotionLabel.text = string.IsNullOrWhiteSpace(emotion) ? string.Empty : emotion;
                _emotionLabel.style.display = string.IsNullOrWhiteSpace(emotion) ? DisplayStyle.None : DisplayStyle.Flex;
            }

            if (_panel != null)
            {
                _panel.EnableInClassList("has-speaker", !string.IsNullOrWhiteSpace(speaker));
                _panel.EnableInClassList("is-neutral", string.IsNullOrWhiteSpace(speaker));
                _panel.EnableInClassList("has-emotion", !string.IsNullOrWhiteSpace(emotion));
            }
        }

        private void SetBody(string text)
        {
            if (_bodyLabel != null)
                _bodyLabel.text = text ?? string.Empty;
        }

        private void SetHint(string text)
        {
            if (_hintLabel != null)
                _hintLabel.text = text ?? string.Empty;
        }

        private void SetContinueVisible(bool isVisible)
        {
            if (_continueButton == null)
                return;

            _continueButton.text = continueButtonText;
            _continueButton.style.display = isVisible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void FocusOverlay()
        {
            _overlay?.Focus();
        }

        private void BindElements(VisualElement root)
        {
            _content = root.Q<ScrollView>("dialogue-content");
            _overlay = root.Q<VisualElement>("dialogue-overlay");
            _panel = root.Q<VisualElement>("dialogue-panel");
            _speakerLabel = root.Q<Label>("dialogue-speaker");
            _emotionLabel = root.Q<Label>("dialogue-emotion");
            _bodyLabel = root.Q<Label>("dialogue-body");
            _hintLabel = root.Q<Label>("dialogue-hint");
            _choiceContainer = root.Q<VisualElement>("dialogue-choices");
            _continueButton = root.Q<Button>("dialogue-continue");
        }

        private bool ValidateBindings()
        {
            return _content != null && _overlay != null &&
                   _panel != null &&
                   _bodyLabel != null &&
                   _hintLabel != null &&
                   _choiceContainer != null &&
                   _continueButton != null &&
                   _speakerLabel != null &&
                   _emotionLabel != null &&
                   _boundRoot.Q<Button>("dialogue-close") != null;
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
