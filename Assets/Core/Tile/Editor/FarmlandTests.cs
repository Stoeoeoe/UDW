using NUnit.Framework;
using UnityEngine;

namespace Core.Tile.Editor
{
    [Category("FarmingTerrain")]
    public sealed class FarmlandTests
    {
        [Test]
        public void UnplowedLandCannotBeIrrigated()
        {
            var land = new FarmlandInfo();
            land.Irrigate();
            Assert.That(land.IsPlowed, Is.False);
            Assert.That(land.IsIrrigated, Is.False);
        }

        [Test]
        public void DryingPreservesPlowingAndAllowsWateringAgain()
        {
            var land = new FarmlandInfo();
            land.Plow();
            land.Irrigate();
            Assert.That(land.IsIrrigated, Is.True);
            land.DryOut();
            Assert.That(land.IsPlowed, Is.True);
            Assert.That(land.IsIrrigated, Is.False);
            land.Irrigate();
            Assert.That(land.IsIrrigated, Is.True);
        }

        [Test]
        public void UnplowingClearsWaterAndRequiresPlowingBeforeWateringAgain()
        {
            var land = new FarmlandInfo();
            land.Plow();
            land.Irrigate();
            land.Unplow();
            land.Irrigate();
            Assert.That(land.IsPlowed, Is.False);
            Assert.That(land.IsIrrigated, Is.False);
        }

        [Test]
        public void RepeatedPlowingPreservesIrrigation()
        {
            var tile = Tile(true);
            Assert.That(tile.TryPlow(), Is.True);
            tile.TryWater();
            var original = tile.FarmlandData;
            Assert.That(tile.TryPlow(), Is.True);
            Assert.That(tile.FarmlandData, Is.SameAs(original));
            Assert.That(tile.FarmlandData.IsIrrigated, Is.True);
        }

        [Test]
        public void NonfarmableTileRejectsAllFarmingOperations()
        {
            var tile = Tile(false);
            Assert.That(tile.TryEnableFarmland(), Is.False);
            Assert.That(tile.TryPlow(), Is.False);
            tile.TryWater();
            tile.DryOut();
            Assert.That(tile.FarmlandData, Is.Null);
        }

        [Test]
        public void WateringDoesNotCreateOrPlowFarmland()
        {
            var tile = Tile(true);
            tile.TryWater();
            Assert.That(tile.FarmlandData, Is.Null);
            tile.TryEnableFarmland();
            tile.TryWater();
            Assert.That(tile.FarmlandData.IsPlowed, Is.False);
            Assert.That(tile.FarmlandData.IsIrrigated, Is.False);
        }

        private static TileData Tile(bool farmable) => new(null, -2, 3, null, Vector3.zero, farmable);
    }
}
