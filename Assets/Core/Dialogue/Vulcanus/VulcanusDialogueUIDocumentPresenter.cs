using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Core.Dialogue.Vulcanus
{
    [RequireComponent(typeof(UIDocument))]
    public class VulcanusDialogueUIDocumentPresenter : MonoBehaviour, IDialoguePresenter, IDialogueAdvanceHandler
    {
        [Header("Layout")]
        [SerializeField] private UIDocument document;
        [SerializeField] private VisualTreeAsset layoutAsset;
        [SerializeField] private StyleSheet styleSheet;

        [Header("Behavior")]
        [SerializeField] private bool hideWhenInactive = true;
        [SerializeField] private string continueButtonText = "Continue";
        [SerializeField] private string choicePromptText = "Choose a response";
        [SerializeField] private string missingLayoutMessage = "Dialogue UI layout is missing.";

        private VisualElement _overlay;
        private VisualElement _panel;
        private Label _speakerLabel;
        private Label _emotionLabel;
        private Label _bodyLabel;
        private Label _hintLabel;
        private VisualElement _choiceContainer;
        private Button _continueButton;
        private bool _isBuilt;
        private bool _waitingForAdvance;
        private bool _waitingForChoice;
        private VulcanusDialogueChoiceOption _selectedOption;
        private readonly List<VulcanusDialogueChoiceOption> _visibleOptions = new();

        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            EnsureBuilt();
            ShowOverlay(true);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(string.Empty);
            SetHint(string.Empty);
            ClearChoices();
            SetContinueVisible(false);
        }

        public IEnumerator PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context)
        {
            EnsureBuilt();
            ShowOverlay(true);
            SetSpeaker(node.Speaker, node.Emotion);
            SetBody(localizedText);
            SetHint("Click, press Enter, or press Space");
            ClearChoices();
            SetContinueVisible(true);

            _waitingForAdvance = true;
            FocusOverlay();
            yield return new WaitUntil(() => !_waitingForAdvance);
        }

        public IEnumerator PresentChoice(VulcanusDialogueChoiceNode node, IReadOnlyList<VulcanusDialogueChoiceOption> options,
            VulcanusDialogueExecutionContext context, Action<VulcanusDialogueChoiceOption> onSelected)
        {
            EnsureBuilt();
            ShowOverlay(true);
            SetSpeaker(string.Empty, string.Empty);
            SetBody(choicePromptText);
            SetHint("Click a choice or press 1-9");
            SetContinueVisible(false);

            _waitingForChoice = true;
            _selectedOption = null;
            RebuildChoices(options, context);
            FocusOverlay();
            yield return new WaitUntil(() => !_waitingForChoice);

            onSelected?.Invoke(_selectedOption);
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            _waitingForAdvance = false;
            _waitingForChoice = false;
            _selectedOption = null;
            ClearChoices();
            SetBody(string.Empty);
            SetHint(string.Empty);
            SetSpeaker(string.Empty, string.Empty);
            SetContinueVisible(false);
            ShowOverlay(!hideWhenInactive);
        }

        public bool TryAdvanceDialogue()
        {
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
            ShowOverlay(!hideWhenInactive);
        }

        private void EnsureBuilt()
        {
            if (_isBuilt)
                return;

            document = document != null ? document : GetComponent<UIDocument>();
            if (document == null)
            {
                Debug.LogError("[VulcanusDialogueUIDocumentPresenter] No UIDocument was found.");
                return;
            }

            var root = document.rootVisualElement;
            root.Clear();
            if (styleSheet != null)
                root.styleSheets.Add(styleSheet);

            var resolvedLayout = layoutAsset != null ? layoutAsset : document.visualTreeAsset;
            if (resolvedLayout != null)
            {
                resolvedLayout.CloneTree(root);
            }
            else
            {
                BuildFallbackLayout(root, missingLayoutMessage);
            }

            BindElements(root);
            if (!ValidateBindings())
            {
                root.Clear();
                BuildFallbackLayout(root, "Dialogue UI was incomplete, using fallback layout.");
                BindElements(root);
            }

            if (_overlay == null)
                _overlay = root;

            _overlay.focusable = true;
            _overlay.tabIndex = 0;
            _overlay.RegisterCallback<PointerDownEvent>(OnPointerDown);
            _overlay.RegisterCallback<KeyDownEvent>(OnKeyDown);

            if (_continueButton != null)
                _continueButton.clicked += ContinueRequested;

            _isBuilt = true;
        }

        private void OnPointerDown(PointerDownEvent evt)
        {
            if (_waitingForAdvance && !IsChoiceTarget(evt.target as VisualElement))
            {
                ContinueRequested();
                evt.StopPropagation();
            }
        }

        private void OnKeyDown(KeyDownEvent evt)
        {
            if (_waitingForAdvance && (evt.keyCode == KeyCode.Space || evt.keyCode == KeyCode.Return || evt.keyCode == KeyCode.KeypadEnter))
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
            _waitingForAdvance = false;
        }

        private void SelectOption(VulcanusDialogueChoiceOption option)
        {
            _selectedOption = option;
            _waitingForChoice = false;
        }

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

        private void ShowOverlay(bool isVisible)
        {
            if (_overlay == null)
                return;

            _overlay.style.display = isVisible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void FocusOverlay()
        {
            _overlay?.Focus();
        }

        private void BindElements(VisualElement root)
        {
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
            return _overlay != null &&
                   _panel != null &&
                   _bodyLabel != null &&
                   _hintLabel != null &&
                   _choiceContainer != null &&
                   _continueButton != null &&
                   _speakerLabel != null &&
                   _emotionLabel != null;
        }

        private static bool IsChoiceTarget(VisualElement target)
        {
            var current = target;
            while (current != null)
            {
                if (current.ClassListContains("dialogue-choice"))
                    return true;

                current = current.parent;
            }

            return false;
        }

        private void BuildFallbackLayout(VisualElement root, string bodyText)
        {
            var overlay = new VisualElement { name = "dialogue-overlay" };
            overlay.AddToClassList("dialogue-overlay");

            var backdrop = new VisualElement { name = "dialogue-backdrop" };
            backdrop.AddToClassList("dialogue-backdrop");
            overlay.Add(backdrop);

            var anchor = new VisualElement { name = "dialogue-anchor" };
            anchor.AddToClassList("dialogue-anchor");
            overlay.Add(anchor);

            var panel = new VisualElement { name = "dialogue-panel" };
            panel.AddToClassList("dialogue-panel");
            anchor.Add(panel);

            var header = new VisualElement();
            header.AddToClassList("dialogue-header");
            panel.Add(header);

            var speaker = new Label { name = "dialogue-speaker" };
            speaker.AddToClassList("dialogue-speaker");
            header.Add(speaker);

            var emotion = new Label { name = "dialogue-emotion" };
            emotion.AddToClassList("dialogue-emotion");
            header.Add(emotion);

            var body = new Label(bodyText) { name = "dialogue-body" };
            body.AddToClassList("dialogue-body");
            panel.Add(body);

            var choices = new VisualElement { name = "dialogue-choices" };
            choices.AddToClassList("dialogue-choices");
            panel.Add(choices);

            var footer = new VisualElement();
            footer.AddToClassList("dialogue-footer");
            panel.Add(footer);

            var hint = new Label { name = "dialogue-hint" };
            hint.AddToClassList("dialogue-hint");
            footer.Add(hint);

            var continueButton = new Button { name = "dialogue-continue", text = continueButtonText };
            continueButton.AddToClassList("dialogue-continue");
            footer.Add(continueButton);

            root.Add(overlay);
        }
    }
}
