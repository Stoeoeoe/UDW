using Character;
using Core.Tile;
using Core.TimeAndWeather;
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
        UrTime CurrentTime,
        InteractionMode Mode
    )
    {
        public bool WorldInteractionBlocked { get; init; }
        public bool CanInteractWithWorld => SceneReady && !WorldInteractionBlocked;

        /// <summary>Pointer has priority, but an unavailable target cannot block a ready nearby one.</summary>
        public AbstractInteractable ActionableInteractable =>
            !CanInteractWithWorld ? null :
            InteractableUnderPointer && InteractableUnderPointer.CanInteract ? InteractableUnderPointer :
            CurrentInteractable && CurrentInteractable.CanInteract ? CurrentInteractable : null;

        public static PlayerInteractionContextSnapshot Empty()
        {
            return new PlayerInteractionContextSnapshot(
                false, null, null, null, null, null, null, null,
                null, null, null, null, default
            );
        }

        public static PlayerInteractionContextSnapshot Create(bool sceneReady,
            GameCharacter character,
            AbstractInteractable currentInteractable,
            TileData tileUnderPointer,
            AbstractInteractable interactableUnderPointer,
            TileData tileUnderCharacter,
            ToolData tool,
            EquippableItem item,
            ConditionState? condition,
            MovementState? movement,
            string conversation, 
            UrTime currentTime,
            bool worldInteractionBlocked = false)
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
                currentTime,
                default
            ) { WorldInteractionBlocked = worldInteractionBlocked };

            return baseSnapshot with
            {
                Mode = InteractionModeResolver.Resolve(baseSnapshot)
            };
        }

    }
}
