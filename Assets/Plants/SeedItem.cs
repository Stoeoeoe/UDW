using Core.Common;
using System;
using Core.Items;
using UnityEngine;

namespace Plants
{
    /// <summary>Inventory seed definition linking a plantable item to its crop data and seed-stage visual.</summary>
    [CreateAssetMenu(fileName = "Seed", menuName = "Game/Items/Plants/Seed", order = 1)]
    public class SeedItem : PlaceableItem
    {
        private static readonly SeedItemValidator Validator = new();
        protected override IScriptableObjectValidator ConfigurationValidator => Validator;

        [SerializeField, Validation.ValidReference]
        private PlantData _plantData;

        public PlantData plantData => _plantData;

        public override GameObject GetPlaceableRepresentation()
        {
            var seedStage = plantData.GetSeedStage();
            return seedStage.Representation.CreateInstance();
        }
    }
}
