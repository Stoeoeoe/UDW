using System;
using System.Collections.Generic;
using Items.Plants;
using Core.Common;
using Core.TimeAndWeather;
using Core.Inventory;
using UnityEngine;
using MoreMountains.Feedbacks;

namespace Plants
{
    /// <summary>Authored growth stages, seasonal rules and harvest settings; validated before gameplay and treated as immutable.</summary>
    [CreateAssetMenu(fileName = "Plant Data", menuName = "Game/Items/Plants/Plant Data")]
    public class PlantData : ValidatedScriptableObject<PlantDataValidator>
    {
        [SerializeField]
        private string _plantId;

        [SerializeField]
        private string _label;

        [SerializeField]
        private string _description;

        // Growth
        [Tooltip("Planting is always allowed. Growth pauses outside these seasons; an empty list means no growth.")]
        [SerializeField, Validation.Required]
        private Season[] growingSeasons = { Season.Spring, Season.Summer, Season.Autumn, Season.Winter };

        [SerializeField, Validation.NotEmpty, Validation.RequiredElements, Validation.Nested]
        private List<GrowthStage> growthStages;

        // Harvest
        [SerializeField, Validation.DefinedEnum]
        private HarvestMethod _harvestMethod;

        [SerializeField, Validation.Required]
        [Validation.MemberNotEmpty(nameof(ItemDefinition.ItemId), "The referenced harvest item must have a nonblank ItemId.")]
        private ItemDefinition _harvestItem;

        [SerializeField, Validation.Min(1)]
        private int _minHarvestQuantity = 1;

        [SerializeField, Validation.Range(1, int.MaxValue - 1)]
        [Validation.AtLeast(nameof(MinHarvestQuantity))]
        private int _maxHarvestQuantity = 1;

        [Tooltip("-1 removes the crop after harvest. Otherwise, return to this earlier, non-harvestable stage.")]
        [SerializeField]
        private int _regrowthStageIndex = -1;

        // Wilting
        [SerializeField, Validation.Min(1, "Must be at least one day.")]
        private int _daysWithoutWaterUntilWilt = 5;

        // Inline Unity serialization cannot preserve null; the omitted wilted visual uses stage tinting.
        [SerializeReference, Validation.Nested]
        private SpriteOrPrefab _wiltedRepresentation;

        [SerializeField, Validation.Min(1, "Must be at least one day.")]
        private int _daysWiltedUntilRemoval = 5;

        [Tooltip("Spawned at the crop position when clearing a wilted crop. The standalone prefab must autoplay and handle its own cleanup.")]
        [SerializeField]
        private MMF_Player _wiltedFeedbackPrefab;

        public string plantId => _plantId;
        public string label => _label;
        public string description => _description;
        public HarvestMethod HarvestMethod => _harvestMethod;
        public ItemDefinition HarvestItem => _harvestItem;
        public int MinHarvestQuantity => _minHarvestQuantity;
        public int MaxHarvestQuantity => _maxHarvestQuantity;
        public int RegrowthStageIndex => _regrowthStageIndex;
        public int DaysWithoutWaterUntilWilt => _daysWithoutWaterUntilWilt;
        public SpriteOrPrefab WiltedRepresentation => _wiltedRepresentation;
        public int DaysWiltedUntilRemoval => _daysWiltedUntilRemoval;
        public MMF_Player WiltedFeedbackPrefab => _wiltedFeedbackPrefab;
        public IReadOnlyList<Season> GrowingSeasons => Array.AsReadOnly(growingSeasons);
        public IReadOnlyList<GrowthStage> GrowthStages => growthStages.AsReadOnly();

        public bool CanGrowInSeason(Season season) => Array.IndexOf(growingSeasons, season) >= 0;

        public int RollHarvestQuantity()
        {
            return UnityEngine.Random.Range(MinHarvestQuantity, MaxHarvestQuantity + 1);
        }

        public bool TryGetHarvestStage(int growthDays, HarvestMethod method, out int stageIndex)
        {
            stageIndex = GetGrowthStageIndexByDays(growthDays);

            return method == HarvestMethod && growthStages[stageIndex].IsHarvestable;
        }

        public GrowthStage GetSeedStage()
        {
            return growthStages[0];
        }

        public GrowthStage GetGrowthStageByDays(int daysPassedSincePlanting)
        {
            var index = GetGrowthStageIndexByDays(daysPassedSincePlanting);
            return growthStages[index];
        }

        public int GetGrowthStageIndexByDays(int daysPassedSincePlanting)
        {
            var best = 0;
            for (var i = 1; i < growthStages.Count; i++)
            {
                var stage = growthStages[i];
                if (stage.DaysToReachStage > daysPassedSincePlanting)
                    break;

                best = i;
            }

            return best;
        }
    }
}
