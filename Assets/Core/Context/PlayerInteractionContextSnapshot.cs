using Character;
using Core.Tile;
using Interaction;
using Interaction.Tools;
using Items;

namespace Core.Context
{
    public record PlayerInteractionContextSnapshot(
        bool SceneReady,
        GameCharacter Character,
        AbstractInteractable CurrentInteractable,
        TileData CurrentTileDataUnderPointer,
        AbstractInteractable InteractableUnderPointer,
        TileData TileUnderCharacter,
        ToolData CurrentTool,
        EquippableItem CurrentlyHeldItem,
        ConditionState? CharacterCondition,
        MovementState?  MovementState,
        string CurrentConversation,
        InteractionMode Mode
    )
    {
        public static PlayerInteractionContextSnapshot Empty()
        {
            return new PlayerInteractionContextSnapshot(
                false, null, null, null, null, null, null, null,
                null, null, null, default
            );
        }

        public static PlayerInteractionContextSnapshot Create(
            bool sceneReady,
            GameCharacter character,
            AbstractInteractable currentInteractable,
            TileData tileUnderPointer,
            AbstractInteractable interactableUnderPointer,
            TileData tileUnderCharacter,
            ToolData tool,
            EquippableItem item,
            ConditionState? condition,
            MovementState?  movement,
            string conversation)
        {
            var baseSnapshot = new PlayerInteractionContextSnapshot(
                sceneReady,
                character,
                currentInteractable,
                tileUnderPointer,
                interactableUnderPointer,
                tileUnderCharacter,
                tool,
                item,
                condition,
                movement,
                conversation,
                default
            );

            return baseSnapshot with
            {
                Mode = InteractionModeResolver.Resolve(baseSnapshot)
            };
        }

    }
}