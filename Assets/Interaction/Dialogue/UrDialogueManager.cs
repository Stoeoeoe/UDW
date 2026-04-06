using Core;
using Core.Events;
using PixelCrushers.DialogueSystem;
using System.Collections;
using Character;
using Interaction.Dialog;
using Interaction.Dialogue;
using UI;
using UnityEngine;

public class UrDialogueManager : Singleton<UrDialogueManager>, IEventListener<UrDialogueLifecycleEvent>, IEventListener<DialogueCancelledEvent>
{
    // TODO: Dialogue Camera here, in AdvDialogue or in GUI?

    private DialogueSystemEvents _dialogueSystemEvents;
    private string _currentConversation;
    private StandardUISubtitlePanel _defaultNPCPanel;
    private AbstractTypewriterEffect _typewriterEffect;

    public string CurrentConversation => _currentConversation;

    void OnEnable()
    {
        this.Subscribe<UrDialogueLifecycleEvent>();
        this.Subscribe<DialogueCancelledEvent>();
    }

    void OnDisable()
    {
        this.Unsubscribe<UrDialogueLifecycleEvent>();
        this.Unsubscribe<DialogueCancelledEvent>();
    }


    public void OnEvent(UrDialogueLifecycleEvent dialogueEvent)
    {
        // TODO: we're both sending and receiving events, that seems odd???
        if (dialogueEvent.EventType == UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started)
        {
            StartCoroutine(StartDialogueCo(dialogueEvent));
        }
    }

    // TODO: Overlap with DialogueEndEvent?
    public void OnEvent(DialogueCancelledEvent e)
    {
        _dialogueSystemEvents.OnConversationCancelled(null);
    }

    private IEnumerator StartDialogueCo(UrDialogueLifecycleEvent dialogueEvent)
    {
        // yield return CameraManager.Current.WaitUntilCameraTransitionEnded();
        // TODO: Perform any setup needed before dialogue is ready 
        _currentConversation = dialogueEvent.Conversation;
        UrDialogueLifecycleEvent.Trigger(dialogueEvent.Conversation, dialogueEvent.Target,
            UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Ready, dialogueEvent.Options);
        yield break;
    }

    private void Start()
    {
        _dialogueSystemEvents = GetComponent<DialogueSystemEvents>();
        _dialogueSystemEvents.conversationEvents.onConversationStart.AddListener(OnDialogueStarted);
        _dialogueSystemEvents.conversationEvents.onConversationEnd.AddListener(OnDialogueFinished);
        _dialogueSystemEvents.pauseEvents.onDialogueSystemPause.AddListener(OnDialoguePaused);
        _dialogueSystemEvents.pauseEvents.onDialogueSystemUnpause.AddListener(OnDialogueUnpaused);
    }


    private void OnDestroy()
    {
        if (!_dialogueSystemEvents)
        {
            // TODO: Have to figure out why this is needed after scene change?
            return;
        }
        _dialogueSystemEvents.conversationEvents.onConversationStart.RemoveListener(OnDialogueStarted);
        _dialogueSystemEvents.conversationEvents.onConversationEnd.RemoveListener(OnDialogueFinished);
        _dialogueSystemEvents.pauseEvents.onDialogueSystemPause.RemoveListener(OnDialoguePaused);
        _dialogueSystemEvents.pauseEvents.onDialogueSystemUnpause.RemoveListener(OnDialogueUnpaused);
    }

    protected void OnDialogueStarted(Transform primaryActor)
    {
        _currentConversation = DialogueManager.LastConversationStarted;
        SendLifecycleEvent(primaryActor, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started);
    }

    protected void OnDialogueFinished(Transform primaryActor)
    {
        _currentConversation = null;
        SendLifecycleEvent(primaryActor, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Finished);

        // var character = MainCharacter.CurrentMainCharacter;
        // _currentConversation = null;
        // // var character = primaryActor.GetComponent<UrCharacter>();
        // if (character != null)
        // {
        //     character.UnFreeze();
        // }
    }


    protected void OnDialoguePaused() =>
        SendLifecycleEvent(null, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Paused);

    protected void OnDialogueUnpaused() =>
        SendLifecycleEvent(null, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Paused);

    private void SendLifecycleEvent(Transform starter, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType type)
    {
//        var currentConversationcontroller = DialogueManager.ConversationController;
        var sourceDialogueActor = MainCharacter.CurrentMainCharacter; // TODO: Make dynamic
        //var targetDialogueActors = DialogueManager.CurrentConversant.GetComponentInChildren<AdvCharacter>(); ; // All other actors are targets
        var lookAtTarget = DialogueManager.CurrentConversant;
        DialogueOptions
            options = lookAtTarget.GetComponentInChildren<UrDialogueSystemTrigger>()?.Options; // TODO: Better solution?
        UrDialogueLifecycleEvent.Trigger(_currentConversation, lookAtTarget, type, options);
    }


    //private void OnSubtitlesRequest(SubtitlesRequestInfo requestInfo)

    //{

    //    AdvDialogueSubtitleEvent.Trigger(DialogueTree.currentDialogue, requestInfo);

    //}


    //private void OnMultipleChoiceRequest(MultipleChoiceRequestInfo requestInfo)

    //{

    //    AdvDialogueChoiceEvent.Trigger(DialogueTree.currentDialogue, requestInfo);

    //}

    public void ContinueOrFastForwardDialogue()
    {
        // Can only do this after Dialogue UI has been instantiated
        this._defaultNPCPanel =
            (GUIManager.Instance.DialogueUI.dialogueControls.npcSubtitleControls as
                StandardUISubtitleControls)?.defaultNPCPanel;
        this._typewriterEffect = _defaultNPCPanel.GetTypewriter();
        // TODO: Cache

        // when we start the dialogue, the typewriter effect may not yet be playing
        if (_typewriterEffect.isPlaying || _defaultNPCPanel.subtitleText.text.Length == 0)
        {
            _defaultNPCPanel.GetTypewriter().Stop();
        }
        else
        {
            _defaultNPCPanel.OnContinue();
        }
    }
}