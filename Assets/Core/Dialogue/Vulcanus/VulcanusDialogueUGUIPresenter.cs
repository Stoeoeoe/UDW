using System;
using System.Collections;
using System.Collections.Generic;
using Interaction.Dialog;
using MoreMountains.Tools;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusDialogueUGUIPresenter : MonoBehaviour, IDialoguePresenter, IDialogueAdvanceHandler
    {
        [Header("Root")]
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private GameObject rootObject;
        [SerializeField] private Selectable defaultSelection;

        [Header("Frame")]
        [SerializeField] private Image backdropImage;
        [SerializeField] private Image panelBackground;

        [Header("Speaker")]
        [SerializeField] private GameObject speakerPortraitRoot;
        [SerializeField] private Image speakerPortraitImage;
        [SerializeField] private TMP_Text speakerText;

        [Header("Text")]
        [SerializeField] private TMP_Text bodyText;

        [Header("Choices")]
        [SerializeField] private RectTransform choiceContainer;
        [SerializeField] private VulcanusDialogueUGUIChoiceView choiceButtonPrefab;

        [Header("Typewriter")]
        [SerializeField] private float charactersPerSecond = 48f;
        [SerializeField] private bool useUnscaledTime = true;
        [SerializeField] private TypewriterSound defaultTypewriterSound;

        [Header("Behavior")]
        [SerializeField] private bool hideWhenInactive = true;

        private bool _waitingForAdvance;
        private bool _waitingForChoice;
        private bool _isTyping;
        private VulcanusDialogueChoiceOption _selectedOption;
        private readonly List<VulcanusDialogueUGUIChoiceView> _spawnedChoices = new();
        private Coroutine _typewriterCoroutine;
        private string _currentLineText = string.Empty;
        private TypewriterSound _currentTypewriterSound;

        public void OnDialogueStarted(VulcanusDialogueExecutionContext context)
        {
            EnsureWired();
            Show(true);
            StopTypewriter(resetText: true);
            SetSpeaker(null, null);
            SetSpeakerPortraitStub(null, null);
            SetBody(string.Empty);
            ClearChoices();
        }

        public IEnumerator PresentLine(VulcanusDialogueLineNode node, string localizedText, VulcanusDialogueExecutionContext context)
        {
            EnsureWired();
            Show(true);
            SetSpeaker(node.Speaker, null);
            SetSpeakerPortraitStub(node.Speaker, node.Emotion);
            ClearChoices();
            StartTypewriter(localizedText, node.Speaker);

            _waitingForAdvance = true;
            yield return new WaitUntil(() => !_waitingForAdvance);
        }

        public IEnumerator PresentChoice(VulcanusDialogueChoiceNode node, IReadOnlyList<VulcanusDialogueChoiceOption> options,
            VulcanusDialogueExecutionContext context, Action<VulcanusDialogueChoiceOption> onSelected)
        {
            EnsureWired();
            Show(true);
            SetSpeaker(null, null);
            SetSpeakerPortraitStub(null, null);
            SetBody(string.Empty);
            _selectedOption = null;
            _waitingForChoice = true;
            StopTypewriter(resetText: false);

            RebuildChoices(options, context);
            FocusFirstChoice();
            yield return new WaitUntil(() => !_waitingForChoice);

            onSelected?.Invoke(_selectedOption);
        }

        public void OnDialogueFinished(VulcanusDialogueExecutionContext context)
        {
            _waitingForAdvance = false;
            _waitingForChoice = false;
            _selectedOption = null;
            StopTypewriter(resetText: true);
            ClearChoices();
            SetSpeaker(null, null);
            SetSpeakerPortraitStub(null, null);
            SetBody(string.Empty);
            Show(!hideWhenInactive);
        }

        public bool TryAdvanceDialogue()
        {
            if (_isTyping)
            {
                CompleteTypewriter();
                return true;
            }

            if (_waitingForAdvance)
            {
                AdvanceAfterLine();
                return true;
            }

            return false;
        }

        private void Reset()
        {
            rootObject = gameObject;
            canvasGroup = GetComponent<CanvasGroup>();
            if (canvasGroup == null)
                canvasGroup = gameObject.AddComponent<CanvasGroup>();
        }

        private void Awake()
        {
            EnsureWired();
            Show(!hideWhenInactive);
        }

        private void OnEnable()
        {
            EnsureWired();
        }

        private void OnDisable()
        {
            StopTypewriter(resetText: false);
        }

        private void EnsureWired()
        {
            if (rootObject == null)
                rootObject = gameObject;

            if (canvasGroup == null)
                canvasGroup = GetComponent<CanvasGroup>();
        }

        private void SelectChoice(VulcanusDialogueChoiceOption option)
        {
            _selectedOption = option;
            _waitingForChoice = false;
        }

        private void RebuildChoices(IReadOnlyList<VulcanusDialogueChoiceOption> options, VulcanusDialogueExecutionContext context)
        {
            ClearChoices();
            if (choiceContainer == null || choiceButtonPrefab == null)
                return;

            for (var i = 0; i < options.Count; i++)
            {
                var option = options[i];
                if (option == null)
                    continue;

                var view = Instantiate(choiceButtonPrefab, choiceContainer);
                var localizedText = context.CurrentDialogue.ResolveLocalizedText(option.MsgKey, option.Text);
                view.Bind($"{i + 1}. {localizedText}", () => SelectChoice(option));
                _spawnedChoices.Add(view);
            }
        }

        private void ClearChoices()
        {
            for (var i = 0; i < _spawnedChoices.Count; i++)
            {
                if (_spawnedChoices[i] != null)
                    Destroy(_spawnedChoices[i].gameObject);
            }

            _spawnedChoices.Clear();
        }

        private void SetSpeaker(string speaker, string emotion)
        {
            if (speakerText != null)
            {
                var hasSpeaker = !string.IsNullOrWhiteSpace(speaker);
                speakerText.text = hasSpeaker ? speaker : string.Empty;
                speakerText.gameObject.SetActive(hasSpeaker);
            }
        }

        private void SetBody(string text)
        {
            if (bodyText != null)
                bodyText.text = text ?? string.Empty;
        }

        private void Show(bool isVisible)
        {
            if (rootObject != null)
                rootObject.SetActive(true);

            if (canvasGroup != null)
            {
                canvasGroup.alpha = isVisible ? 1f : 0f;
                canvasGroup.interactable = isVisible;
                canvasGroup.blocksRaycasts = isVisible;
            }
            else if (rootObject != null)
            {
                rootObject.SetActive(isVisible);
            }
        }

        private void FocusFirstChoice()
        {
            if (_spawnedChoices.Count > 0 && _spawnedChoices[0] != null && _spawnedChoices[0].Button != null)
            {
                EventSystem.current?.SetSelectedGameObject(_spawnedChoices[0].Button.gameObject);
                return;
            }

            if (defaultSelection != null)
                EventSystem.current?.SetSelectedGameObject(defaultSelection.gameObject);
        }

        private void AdvanceAfterLine()
        {
            _waitingForAdvance = false;
        }

        private void StartTypewriter(string text, string speakerId)
        {
            StopTypewriter(resetText: false);
            _currentLineText = text ?? string.Empty;
            _currentTypewriterSound = ResolveTypewriterSound(speakerId);

            if (bodyText == null)
                return;

            bodyText.maxVisibleCharacters = 0;
            bodyText.text = _currentLineText;
            bodyText.ForceMeshUpdate();

            if (string.IsNullOrEmpty(_currentLineText) || charactersPerSecond <= 0f)
            {
                CompleteTypewriter();
                return;
            }

            _isTyping = true;
            _typewriterCoroutine = StartCoroutine(TypewriterCoroutine());
        }

        private IEnumerator TypewriterCoroutine()
        {
            if (bodyText == null)
                yield break;

            bodyText.ForceMeshUpdate();
            var totalVisibleCharacters = bodyText.textInfo.characterCount;
            if (totalVisibleCharacters <= 0)
            {
                _isTyping = false;
                bodyText.maxVisibleCharacters = int.MaxValue;
                yield break;
            }

            var revealedCharacters = 0;
            var revealTimer = 0f;
            var secondsPerCharacter = 1f / Mathf.Max(1f, charactersPerSecond);

            while (revealedCharacters < totalVisibleCharacters)
            {
                revealTimer += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
                while (revealTimer >= secondsPerCharacter && revealedCharacters < totalVisibleCharacters)
                {
                    revealTimer -= secondsPerCharacter;
                    PlayCharacterAudio(revealedCharacters);
                    revealedCharacters++;
                    bodyText.maxVisibleCharacters = revealedCharacters;
                }

                yield return null;
            }

            _isTyping = false;
            _typewriterCoroutine = null;
            bodyText.maxVisibleCharacters = int.MaxValue;
        }

        private void CompleteTypewriter()
        {
            if (bodyText != null)
            {
                bodyText.text = _currentLineText ?? string.Empty;
                bodyText.maxVisibleCharacters = int.MaxValue;
                bodyText.ForceMeshUpdate();
            }

            if (_typewriterCoroutine != null)
            {
                StopCoroutine(_typewriterCoroutine);
                _typewriterCoroutine = null;
            }

            _isTyping = false;
        }

        private void StopTypewriter(bool resetText)
        {
            if (_typewriterCoroutine != null)
            {
                StopCoroutine(_typewriterCoroutine);
                _typewriterCoroutine = null;
            }

            _isTyping = false;
            if (bodyText != null)
                bodyText.maxVisibleCharacters = int.MaxValue;

            if (resetText)
                _currentLineText = string.Empty;
        }

        private void PlayCharacterAudio(int characterIndex)
        {
            if (bodyText == null || _currentTypewriterSound == null || _currentTypewriterSound.audioClips == null ||
                _currentTypewriterSound.audioClips.Length == 0 || characterIndex < 0 ||
                characterIndex >= bodyText.textInfo.characterCount)
                return;

            var character = bodyText.textInfo.characterInfo[characterIndex].character;
            if (char.IsWhiteSpace(character))
                return;

            var clip = _currentTypewriterSound.audioClips[UnityEngine.Random.Range(0, _currentTypewriterSound.audioClips.Length)];
            if (clip == null || MMSoundManager.Current == null)
                return;

            var pitch = UnityEngine.Random.Range(_currentTypewriterSound.pitchMin, _currentTypewriterSound.pitchMax);
            MMSoundManager.Current.PlaySound(
                clip,
                MMSoundManager.MMSoundManagerTracks.Sfx,
                Vector3.zero,
                pitch: pitch);
        }

        private TypewriterSound ResolveTypewriterSound(string speakerId)
        {
            if (DataManager.Current == null || string.IsNullOrWhiteSpace(speakerId))
                return defaultTypewriterSound;

            if (DataManager.Current.TypewriterSounds != null &&
                DataManager.Current.TypewriterSounds.TryGetValue(speakerId, out var mappedByName) &&
                mappedByName != null)
            {
                return mappedByName;
            }

            if (DataManager.Current.typewriterSounds == null)
                return defaultTypewriterSound;

            for (var i = 0; i < DataManager.Current.typewriterSounds.Count; i++)
            {
                var candidate = DataManager.Current.typewriterSounds[i];
                if (candidate != null &&
                    string.Equals(candidate.ActorId, speakerId, StringComparison.OrdinalIgnoreCase))
                {
                    return candidate;
                }
            }

            return defaultTypewriterSound;
        }

        private void SetSpeakerPortraitStub(string speaker, string emotion)
        {
            if (speakerPortraitRoot != null)
                speakerPortraitRoot.SetActive(!string.IsNullOrWhiteSpace(speaker));

            if (speakerPortraitImage != null)
            {
                // Stub: future implementation should resolve portrait sprite by speaker + emotion.
                speakerPortraitImage.sprite = null;
                speakerPortraitImage.enabled = !string.IsNullOrWhiteSpace(speaker);
            }
        }
    }
}
