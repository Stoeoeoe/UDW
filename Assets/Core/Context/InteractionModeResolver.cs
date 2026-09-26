using Interaction.Dialogue;
using Plants;

namespace Core.Context
{
    public class InteractionModeResolver
    {
        public static InteractionMode Resolve(PlayerInteractionContextSnapshot context)
        {
            // Nothing to do if no character
            if (context.Character == null)
                return InteractionMode.None;

            // Priority: interactables in front 
            if (context.CurrentInteractable)
            {
                return context.CurrentInteractable switch
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
