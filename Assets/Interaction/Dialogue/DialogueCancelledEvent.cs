using Core.Events;
using Interaction.Dialog;
using UnityEngine;

namespace Interaction.Dialogue
{
    public struct DialogueEndEvent
    {
        public static void Trigger() => EventBus<DialogueEndEvent>.Raise(new DialogueEndEvent());
    }
}