using Interaction.Dialog;
using MoreMountains.Tools;
using UnityEngine;

namespace Interaction.Dialogue
{
    public struct UrDialogueLifecycleEvent
    {
        public string Conversation;
        public UrDialogueLifecycleEventType EventType;
        public Transform Target;
        public DialogueOptions Options;

        static UrDialogueLifecycleEvent e;

        public static void Trigger(string conversation, Transform target, UrDialogueLifecycleEventType eventType, DialogueOptions options)
        {
            e.Conversation = conversation;
            e.EventType = eventType;
            e.Options = options;
            e.Target = target;
            MMEventManager.TriggerEvent(e);
        }

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