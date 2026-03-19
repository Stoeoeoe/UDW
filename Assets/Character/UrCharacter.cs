using System.Collections.Generic;
using Animancer;
using Character.Abilities;
using Core.Tile;
using Core.Tile.TileHighlight;
using Interaction;
using Interaction.Tools;
using Interaction.Tools.Energy;
using Items;
using JetBrains.Annotations;
using MoreMountains.InventoryEngine;
using MoreMountains.TopDownEngine;
using PixelCrushers.DialogueSystem;
using UnityEngine;
using UnityEngine.Serialization;

namespace Character
{
    public class UrCharacter : MoreMountains.TopDownEngine.Character
    {
        [SerializeField] protected NamedAnimancerComponent animancer;
        [SerializeField] protected InteractionSphere interactionSphere;

        [SerializeField]
        protected UrCharacterPerformPrimaryActionAbility
            performPrimaryActionAbility; // TODO: Probably doesn't belong here

        [SerializeField] protected TileHighlighter tileHighlighter; // TODO: Probably doesn't belong here
        [SerializeField] protected Transform toolInteractionAnchor;
        [SerializeField] protected bool pollTileDataEveryFrame;
        [SerializeField] protected ActionRegistry actionRegistry;
        [SerializeField] protected ToolActionRegistry toolActionRegistry;
        [ActorPopup(true)] [SerializeField] protected string actor;

        [SerializeField] protected ToolData[] startingTools;
        [SerializeField] protected InventoryItem[] startingItems;

        [field: SerializeField] protected Energy Energy { get; private set; }
        [SerializeField] protected int startEnergy = 100;

        public Inventory MainInventory { get; private set; }

        public NamedAnimancerComponent Animancer => animancer;
        public InteractionSphere InteractionSphere => interactionSphere;
        public TileHighlighter TileHighlighter => tileHighlighter;
        public Transform ToolInteractionAnchor => toolInteractionAnchor;

        public UrCharacterPerformPrimaryActionAbility PerformPrimaryAction => performPrimaryActionAbility;

        public ToolData CurrentTool => CurrentlyHeldItem as ToolData;

        // public BaseTool CurrentTool { get; private set; }
        // public BaseTool CurrentTool => PerformPrimaryAction?.CurrentTool;
        public Vector2Int CurrentTileCoordinates => MapManager.Current.GetCurrentTileCoordinates(this);
        public AbstractInteractable CurrentInteractable => interactionSphere.GetClosestInteractable();

        public TopDownController2D Controller2D => this._controller as TopDownController2D;
        [CanBeNull] public TileData CurrentTileData { get; private set; }
        public EquippableItem CurrentlyHeldItem { get; protected set; }
        public ActionRegistry ActionRegistry => actionRegistry;
        public ToolActionRegistry ToolActionRegistry => toolActionRegistry;

        [CanBeNull]
        public TileData TileDataInFront =>
            MapManager.Current.GetTileDataInDirectionOfCharacter(this, this._controller.CurrentDirection);

        [CanBeNull]
        public TileData TileDataInBack =>
            MapManager.Current.GetTileDataInDirectionOfCharacter(this, -this._controller.CurrentDirection);


        public List<TileData> TilesAround(int size)
        {
            var relativeTiles = new Vector2Int[(size * 2 + 1) * (size * 2 + 1) - 1];
            int index = 0;
            for (int x = -size; x <= size; x++)
            {
                for (int y = -size; y <= size; y++)
                {
                    if (x == 0 && y == 0) continue; // Skip the center tile
                    relativeTiles[index++] = new Vector2Int(x, y);
                }
            }

            return MapManager.Current.GetTileDataAround(this, relativeTiles);
        }

        protected override void Initialization()
        {
            base.Initialization();

        }

        private void Start()
        {

            this.MainInventory = Inventory.FindInventory("MainInventory", PlayerID);
            foreach (var tool in startingTools)
            {
                this.MainInventory.AddItem(tool, 1);
            }

            if (startingTools.Length > 0)
            {
                CurrentlyHeldItem = startingTools[0];
                // SetTool(startingTools[0]);
            }

            foreach (var item in startingItems)
            {
                this.MainInventory.AddItem(item, 1);
            }

            this.toolActionRegistry.Initialize(this);
            this.actionRegistry.Initialize(this);

            Energy.Initialize(startEnergy);
            
        }

        public void RotateTowards(Vector3 transformPosition)
        {
            // Determine the direction to face
            Vector3 directionToFace = (transformPosition - this.transform.position).normalized;
            // Round to the nearest cardinal direction (Left, Right, Up, Down)
            if (Mathf.Abs(directionToFace.x) > Mathf.Abs(directionToFace.y))
            {
                directionToFace = new Vector3(Mathf.Sign(directionToFace.x), 0, 0); // Left or Right
            }
            else
            {
                directionToFace = new Vector3(0, Mathf.Sign(directionToFace.y), 0); // Up or Down
            }

            this.Controller2D.CurrentDirection = directionToFace;
        }

        // public void SetTool(ToolData tool)
        // {
        //     CurrentTool = tool;
        //     // this.PerformPrimaryAction?.SwitchTool(tool.ToolData);
        // }


        // TODO
        // public void TalkTo(UrCharacter otherCharacter)
        // {
        //     if (!DialogueManager.IsConversationActive)
        //     {
        //         if (conversation == null)
        //         {
        //             Debug.LogWarning($"No conversation assigned to ShowTextInteractable on {this.gameObject.name}");
        //             return;
        //         }
        //
        //         if (!options.CanMoveWhileTalking)
        //         {
        //             instigator.Freeze();
        //             instigator.MovementState.ChangeState(CharacterStates.MovementStates.Idle);
        //         }
        //
        //         // if (options.RotateDialogueStarterTowardsTarget)
        //         // {
        //         //     otherCharacter.RotateTowards(instigator.transform.position);
        //         // }
        //
        //         DialogueManager.Instance.StartConversation(conversation, this.transform, instigator.transform);
        //
        //         UrDialogueLifecycleEvent.Trigger(transform, UrDialogueLifecycleEvent.UrDialogueLifecycleEventType.Started, options);
        //         
        //         // TODO: Unfreeze
        //     }
        // }

        protected override void EveryFrame()
        {
            base.EveryFrame();
            if (pollTileDataEveryFrame && MovementState.CurrentState != CharacterStates.MovementStates.Idle)
            {
                CheckCurrentTileData();
            }
        }

        private void CheckCurrentTileData()
        {
            var tileData = MapManager.Current.GetTileDataBelowCharacter(this);
            if (tileData == CurrentTileData) return;
            CurrentTileData = tileData;
            CharacterChangedTileEvent.Trigger(tileData, this);
        }

        protected void SetHeldItem(EquippableItem item)
        {
            this.CurrentlyHeldItem = item;
        }

        public void Unequip(EquippableItem item)
        {
            if (this.CurrentlyHeldItem == item)
            {
                this.CurrentlyHeldItem = null;
            }
        }
        
                
        public void ConsumeEnergy(int amount)
        {
            Energy?.ConsumeEnergy(amount);
        }
    }
}