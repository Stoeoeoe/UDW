using Core.Events;
using Interaction.Dialog;
using UnityEngine;

namespace Interaction.Dialogue
{
    public struct DialogueCancelledEvent
    {
        public static void Trigger() => EventBus<DialogueCancelledEvent>.Raise(new DialogueCancelledEvent());
    }
}