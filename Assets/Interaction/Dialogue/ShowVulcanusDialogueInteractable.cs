using Character;
using Core.Dialogue.Vulcanus;
using Core.Quests;
using Core.Scripting;
using Interaction.Dialog;
using UI.Shared;
using UnityEngine;
using VContainer;

namespace Interaction.Dialogue
{
    public class ShowVulcanusDialogueInteractable : AbstractInteractable
    {
        [SerializeField] private string dialogueId;
        [SerializeField] private DialogueOptions options = new();
        [Inject] private VulcanusDialogueRunner _dialogue;
        [Inject] private QuestService _quests;
        [Inject] private LuaRuntime _lua;
        [Inject] private QuestSettings _questSettings;
        private SpriteRenderer _questMark;
        private VulcanusDialogueExecutionContext _conversation;
        private GameCharacter _character;
        private GameCharacter Character => _character ??= GetComponentInParent<GameCharacter>();

        public string DialogueId => dialogueId;
        public DialogueOptions Options => options;

        /// <summary>Set while the character has no time to talk, such as a routine character running too late.</summary>
        public bool Busy { get; set; }

        /// <summary>Without a dialogue there is nothing to say, so the character cannot be talked to; nor while busy.</summary>
        public override bool CanInteract => !Busy && !string.IsNullOrWhiteSpace(DialogueToPlay(out _)) && base.CanInteract;

        /// <summary>
        /// What talking now plays: the dialogue of a quest objective for this character first, then the one its routine
        /// set, otherwise the character's own (the first <see cref="CharacterDefinition.Dialogues"/> entry whose condition
        /// holds). The routine's choice is never overwritten, so the character returns to it afterwards.
        /// </summary>
        private string DialogueToPlay(out QuestConversation quest)
        {
            quest = Character ? _quests.FindConversation(Character.CharacterId) : null;
            if (!string.IsNullOrEmpty(quest?.DialogueId)) return quest.DialogueId;
            if (!string.IsNullOrEmpty(dialogueId)) return dialogueId;
            return Character && Character.Definition
                ? Character.Definition.DialogueFor(_lua.Conditions.EvaluateCondition)
                : null;
        }

        /// <summary>
        /// Changes what the character says next, for characters whose routine decides it through the day. A conversation
        /// already running finishes as it started.
        /// </summary>
        public void UseDialogue(string id) => dialogueId = id ?? "";

        /// <summary>Whether a conversation started by talking to this character is still running.</summary>
        public bool IsTalking => _conversation != null && _dialogue.ActiveContext == _conversation;

        /// <summary>A character with something for an active quest shows the quest mark above their head.</summary>
        private void LateUpdate()
        {
            var marked = Character && _quests.HasObjectiveFor(Character.CharacterId);
            if (marked && !_questMark) _questMark = CreateQuestMark();
            if (_questMark) _questMark.enabled = marked;
        }

        private SpriteRenderer CreateQuestMark()
        {
            var mark = new GameObject("Quest mark");
            mark.transform.SetParent(Character.Graphics, false);
            mark.transform.localPosition = _questSettings.markOffset;
            var renderer = mark.AddComponent<SpriteRenderer>();
            renderer.sprite = _questSettings.markIcon;
            var body = Character.Graphics.GetComponentInChildren<SpriteRenderer>();
            renderer.sortingLayerID = body.sortingLayerID;
            renderer.sortingOrder = body.sortingOrder + 100;
            return renderer;
        }

        protected override bool Interact(GameCharacter instigator)
        {
            var runner = _dialogue;
            if (runner.IsDialogueActive)
                return false;

            // The runner stops game time for every dialogue.
            var pause = options.CanMoveWhileTalking ? ScreenPauseMode.None : ScreenPauseMode.Character;
            var id = DialogueToPlay(out var quest);
            // A quest objective is met only by a conversation that reaches its end.
            if (!runner.StartDialogue(id, instigator, pause, quest == null ? null : () => _quests.CompleteConversation(quest)))
                return false;
            _conversation = runner.ActiveContext;

            return true;
        }
    }
}
