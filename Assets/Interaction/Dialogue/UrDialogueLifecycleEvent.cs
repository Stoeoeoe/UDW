using Core.Events;
using Interaction.Dialog;
using UnityEngine;

namespace Interaction.Dialogue
{
    public struct UrDialogueLifecycleEvent
    {
        public string Conversation;
        public UrDialogueLifecycleEventType EventType;
        public Transform Target;
        public DialogueOptions Options;

        public static void Trigger(string conversation, Transform target, UrDialogueLifecycleEventType eventType, DialogueOptions options)
            => EventBus<UrDialogueLifecycleEvent>.Raise(new UrDialogueLifecycleEvent
            {
                Conversation = conversation,
                EventType    = eventType,
                Options      = options,
                Target       = target,
            });

        public enum UrDialogueLifecycleEventType
        {
            Started,
            Ready,
            Finished,
            Paused,
            Unpaused
        }
    }
}