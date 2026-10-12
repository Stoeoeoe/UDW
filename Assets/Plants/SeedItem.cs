using Core.Common;
using System;
using Core.Items;
using UnityEngine;

namespace Plants
{
    // TODO: Maybe take apart seed, growth stages and plant item into separate classes...

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
