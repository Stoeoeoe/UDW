using System.Collections.Generic;
using Animancer;
using Core;
using Core.Tile;
using Input;
using MoreMountains.TopDownEngine;
using SuperTiled2Unity;
using UnityEngine;
using TerrainData = Core.Tile.TerrainData;

namespace Character.Abilities
{
    public class UrCharacterAbility : CharacterAbility
    {
        protected CharacterButtonActivation _characterButtonActivation;
        public UrInputManager UrInputManager => this._inputManager as UrInputManager;
        public UrCharacter CurrentCharacter => this._character as UrCharacter;
        public TileData CurrentTileData => CurrentCharacter.CurrentTileData;

        public TileData TileDataInFront => CurrentCharacter.TileDataInFront;
        public TileData TileDataInBack => CurrentCharacter.TileDataInBack;

        public  bool BlockInFrontOfInteractable { get; }

        public CharacterStates.CharacterConditions CurrentCondition =>
            this._character.ConditionState.CurrentState;

        public CharacterStates.MovementStates CurrentMovementState => this._character.MovementState.CurrentState;

        protected NamedAnimancerComponent Animancer => CurrentCharacter.Animancer;

        public Vector2Int CurrentTileCoordinates =>
            MapManager.Instance.GetCurrentTileCoordinates(this.CurrentCharacter);
        
        public Vector2Int GetTileCoordinatesInDirection(Vector2 relativeDirection)
        {
            var characterDirection = CurrentCharacter.Controller2D.CurrentDirection;
            var targetCoordinates = (CurrentTileCoordinates +
                                     new Vector2Int(
                                         (int)characterDirection.x * (int)relativeDirection.x,
                                         (int)characterDirection.y * (int)relativeDirection.y
                                     ));
            return targetCoordinates;
        }

        protected override void Initialization()
        {
            base.Initialization();
            _characterButtonActivation = _character.FindAbility<CharacterButtonActivation>();
        }

        public override bool AbilityAuthorized
        {
            get
            {
                // If we're in front of an interactable, we interact with it instead of using a tool etc.,
                if (BlockInFrontOfInteractable && _characterButtonActivation.AbilityAuthorized && _characterButtonActivation.InButtonActivatedZone)
                {
                    return false;
                }

                return base.AbilityAuthorized;
            }
        }

        // will assume right = forward, left = backward
        private List<TileData> GetTilesAround(Vector2Int[] relativeTiles)
        {
            return MapManager.Instance.GetTileDataAround(this.CurrentCharacter, relativeTiles);
        }
    }
}