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
        /// <summary>Keyboard and mouse play, where the mouse can hover a target besides the one in front.</summary>
        public bool UsesPointer { get; init; }
        public bool CanInteractWithWorld => SceneReady && !WorldInteractionBlocked;

        /// <summary>The ready target under the pointer in keyboard and mouse play; right click uses it.</summary>
        public AbstractInteractable HoveredTarget => UsesPointer ? Ready(InteractableUnderPointer) : null;

        /// <summary>The ready target in front of the character; keyboard and gamepad Interact use it.</summary>
        public AbstractInteractable FrontTarget => Ready(CurrentInteractable);

        /// <summary>The outlined target: the hovered one, else the one in front.</summary>
        public AbstractInteractable ActionableInteractable => HoveredTarget ? HoveredTarget : FrontTarget;

        private AbstractInteractable Ready(AbstractInteractable target) =>
            CanInteractWithWorld && target && target.CanInteract ? target : null;

        /// <summary>The same moment with only these targets, so the mode and actions follow the chosen one.</summary>
        public PlayerInteractionContextSnapshot WithTargets(AbstractInteractable hovered, AbstractInteractable front)
        {
            var narrowed = this with { InteractableUnderPointer = hovered, CurrentInteractable = front };
            return narrowed with { Mode = InteractionModeResolver.Resolve(narrowed) };
        }

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
            bool worldInteractionBlocked = false,
            bool usesPointer = false)
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
            ) { WorldInteractionBlocked = worldInteractionBlocked, UsesPointer = usesPointer };

            return baseSnapshot with
            {
                Mode = InteractionModeResolver.Resolve(baseSnapshot)
            };
        }

    }
}
