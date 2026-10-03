using Interaction.Dialogue;
using Plants;

namespace Core.Context
{
    public class InteractionModeResolver
    {
        public static InteractionMode Resolve(PlayerInteractionContextSnapshot context)
        {
            // Nothing to do if no character
            if (!context.SceneReady || context.Character == null)
                return InteractionMode.None;

            // The same target is used by the action: ready pointer target, then ready proximity target.
            var interactable = context.ActionableInteractable;
            if (interactable)
            {
                return interactable switch
                {
                    ShowVulcanusDialogueInteractable when string.IsNullOrEmpty(context.CurrentConversation) => InteractionMode.DialogueReady,
                    ShowVulcanusDialogueInteractable when !string.IsNullOrEmpty(context.CurrentConversation) => InteractionMode.DialogueInProgress,
                    _ => InteractionMode.Interact
                };
            }

            // Next priority: tool in hand
            if (context.CurrentTool != null)
                return InteractionMode.Tool;

            // Seeds act like tools but only for planting
            if (context.CurrentlyHeldItem is SeedItem)
                return InteractionMode.PlantSeed;

            // Nothing else
            return InteractionMode.None;
        }
    }
}
