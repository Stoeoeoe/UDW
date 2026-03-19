using Character;
using Core.Tile;
using Interaction;
using Interaction.Tools;
using Items;
using MoreMountains.TopDownEngine;

namespace Core.Context
{
    public record PlayerInteractionContextSnapshot(
        UrCharacter Character,
        AbstractInteractable InteractableInFront,
        TileData CurrentTileDataUnderPointer,
        AbstractInteractable InteractableUnderPointer,
        TileData TileUnderCharacter,
        ToolData CurrentTool,
        EquippableItem CurrentlyHeldItem,
        CharacterStates.CharacterConditions? CharacterCondition,
        CharacterStates.MovementStates? MovementState,
        string CurrentConversation,
        InteractionMode Mode
    )
    {
        public static PlayerInteractionContextSnapshot Empty()
        {
            return new PlayerInteractionContextSnapshot(
                null, null, null, null, null, null, null,
                null, null, null, default
            );
        }

        public static PlayerInteractionContextSnapshot Create(
            UrCharacter character,
            AbstractInteractable interactableInFront,
            TileData tileUnderPointer,
            AbstractInteractable interactableUnderPointer,
            TileData tileUnderCharacter,
            ToolData tool,
            EquippableItem item,
            CharacterStates.CharacterConditions? condition,
            CharacterStates.MovementStates? movement,
            string conversation)
        {
            var baseSnapshot = new PlayerInteractionContextSnapshot(
                character,
                interactableInFront,
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