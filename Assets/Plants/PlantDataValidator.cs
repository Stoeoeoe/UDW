using System.Collections.Generic;
using Core.Common;
using Items.Plants;
using MoreMountains.Tools;

namespace Plants
{
    /// <summary>Validates growth-stage ordering, regrowth relationships and standalone wilt-clearing feedback setup.</summary>
    public sealed class PlantDataValidator : ScriptableObjectValidator<PlantData>
    {
        protected override void CollectConfigurationErrors(PlantData asset, List<ConfigurationError> errors)
        {
            var feedback = asset.WiltedFeedbackPrefab;
            if (feedback)
            {
                var cleanup = feedback.GetComponent<MMTimedDestruction>();
                if (!feedback.AutoPlayOnStart || !feedback.enabled || !feedback.gameObject.activeSelf ||
                    !cleanup || !cleanup.enabled || cleanup.TimeBeforeDestruction <= 0 ||
                    cleanup.TimeDestructionMode != MMTimedDestruction.TimedDestructionModes.Destroy)
                    Report(errors, asset, "_wiltedFeedbackPrefab",
                        "Use an active feedback prefab with Auto Play On Start and enabled MM Timed Destruction with a positive lifetime in Destroy mode.");
            }

            // Attributes validate individual values and references; stage relationships live here.
            // Attribute validation reports missing/empty lists before these cross-stage rules run.
            if (errors.Exists(error => error.Setting == "growthStages"))
            {
                if (asset.RegrowthStageIndex != -1)
                    Report(errors, asset, "_regrowthStageIndex", "Use -1 or an index into valid growth stages.");
                return;
            }

            var stages = asset.GrowthStages;

            ValidateGrowthStageOrder(asset, stages, errors);

            // -1 means harvest removes the crop, so no regrowth stage is needed.
            if (asset.RegrowthStageIndex == -1) return;
            if (asset.RegrowthStageIndex < 0 || asset.RegrowthStageIndex >= stages.Count || stages[asset.RegrowthStageIndex] == null)
            {
                Report(errors, asset, "_regrowthStageIndex", "Use -1 or a valid growth stage index.");
                return;
            }

            // Repeat harvests must return to an immature stage and require further growth.
            // Check every harvestable stage so an earlier harvest cannot reset the crop forwards.
            // With no harvestable stages, a regrowth configuration has no valid harvest cycle.
            var regrowth = stages[asset.RegrowthStageIndex];
            var hasHarvestStage = false;
            var earlierThanHarvests = true;
            for (var i = 0; i < stages.Count; i++)
            {
                if (stages[i] == null || !stages[i].IsHarvestable) continue;
                hasHarvestStage = true;
                if (asset.RegrowthStageIndex >= i || regrowth.DaysToReachStage >= stages[i].DaysToReachStage)
                    earlierThanHarvests = false;
            }

            if (regrowth.IsHarvestable || !hasHarvestStage || !earlierThanHarvests)
                Report(errors, asset, "_regrowthStageIndex", "Must select a non-harvestable stage earlier than every harvestable stage, or use -1.");
        }

        private static void ValidateGrowthStageOrder(PlantData asset, IReadOnlyList<GrowthStage> stages,
            List<ConfigurationError> errors)
        {
            if (stages[0] != null && stages[0].DaysToReachStage != 0)
                Report(errors, asset, "growthStages[0]._daysToReachStage", "The seed stage must start at day zero.");

            for (var i = 1; i < stages.Count; i++)
            {
                var previous = stages[i - 1];
                var current = stages[i];
                // RequiredElements reports missing stages separately.
                if (previous == null || current == null) continue;

                if (current.DaysToReachStage <= previous.DaysToReachStage)
                    Report(errors, asset, $"growthStages[{i}]._daysToReachStage", "Each growth stage must start later than the previous stage.");
            }
        }
    }
}
