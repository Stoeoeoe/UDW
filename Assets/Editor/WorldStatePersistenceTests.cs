using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Game;
using Core.TimeAndWeather;
using NUnit.Framework;
using Plants;

public sealed class WorldStatePersistenceTests
{
    [Test]
    public void SetAndTryGetPreserveTheConcreteStateType()
    {
        var world = new WorldState();
        world.Set("farm", "plot-1", new FarmlandState { plowed = true, irrigated = false });

        Assert.That(world.TryGet("farm", "plot-1", out FarmlandState state), Is.True);
        Assert.That(state.plowed, Is.True);
        Assert.That(state.irrigated, Is.False);
        Assert.That(world.TryGet("farm", "missing", out FarmlandState _), Is.False);
    }

    [Test]
    public void PlantsCanBeEnumeratedAcrossLocationsWithoutASeparateManagerStore()
    {
        var world = new WorldState();
        world.Set("farm", "plant:1,2", new PlantState("lentils") { daysPassedSincePlanting = 2 });
        world.Set("village", "plant:-3,4", new PlantState("lentils"));

        var entries = world.GetStates<PlantState>().ToArray();
        Assert.That(entries, Has.Length.EqualTo(2));
        Assert.That(entries.Single(entry => entry.LocationId == "farm").ObjectId, Is.EqualTo("plant:1,2"));
        Assert.That(entries.Single(entry => entry.LocationId == "farm").State.daysPassedSincePlanting, Is.EqualTo(2));
        Assert.That(world.GetStates<PlantState>("farm").Count(), Is.EqualTo(1));
        Assert.That(world.TryGet("farm", "plant:1,2", out PlantState plant), Is.True);
        Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(2));
    }

    [Test]
    public void SaveAndLoadRoundTripWorldPlayerAndStory()
    {
        var slot = "test-" + Guid.NewGuid().ToString("N");
        var path = GameSaveService.GetSavePath(slot);
        var data = new GameSaveData
        {
            schemaVersion = GameSaveData.CurrentVersion,
            worldBaselineVersion = 1,
            player = new PlayerSaveData(),
            story = new StorySaveData(),
            time = new GameTimeState
            {
                initialized = true,
                daysSinceStart = 4,
                season = Season.Spring,
                dayOfSeason = 8,
                hour = 14,
                minute = 20,
                secondsTowardNextMinute = 2.5f
            },
            world = new WorldSaveData()
        };
        data.player.skills.Add(new SkillLevelRecord { id = "hammer-mastery", level = 3 });
        data.story.flags.Add("met-blacksmith");
        data.world.locations.Add("farm", new Dictionary<string, WorldObjectState>
        {
            ["plot-1"] = new FarmlandState { plowed = true, irrigated = false },
            ["plant:1,2"] = new PlantState("lentils") { daysPassedSincePlanting = 3 }
        });

        try
        {
            GameSaveService.Save(slot, data);

            Assert.That(GameSaveService.TryLoad(slot, out var loaded), Is.True);
            Assert.That(loaded.schemaVersion, Is.EqualTo(GameSaveData.CurrentVersion));
            Assert.That(loaded.worldBaselineVersion, Is.EqualTo(1));
            Assert.That(loaded.time.daysSinceStart, Is.EqualTo(4));
            Assert.That(loaded.time.season, Is.EqualTo(Season.Spring));
            Assert.That(loaded.time.dayOfSeason, Is.EqualTo(8));
            Assert.That(loaded.time.hour, Is.EqualTo(14));
            Assert.That(loaded.time.minute, Is.EqualTo(20));
            Assert.That(loaded.time.secondsTowardNextMinute, Is.EqualTo(2.5f));
            Assert.That(loaded.player.skills, Has.Count.EqualTo(1));
            Assert.That(loaded.player.skills[0].id, Is.EqualTo("hammer-mastery"));
            Assert.That(loaded.player.skills[0].level, Is.EqualTo(3));
            Assert.That(loaded.story.flags, Is.EquivalentTo(new[] { "met-blacksmith" }));
            Assert.That(loaded.world.locations["farm"]["plot-1"], Is.TypeOf<FarmlandState>());
            var plot = (FarmlandState)loaded.world.locations["farm"]["plot-1"];
            Assert.That(plot.plowed, Is.True);
            Assert.That(plot.irrigated, Is.False);
            Assert.That(loaded.world.locations["farm"]["plant:1,2"], Is.TypeOf<PlantState>());
            var plant = (PlantState)loaded.world.locations["farm"]["plant:1,2"];
            Assert.That(plant.plantID, Is.EqualTo("lentils"));
            Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(3));
        }
        finally
        {
            File.Delete(path);
            File.Delete(path + ".tmp");
            File.Delete(path + ".bak");
        }
    }
}
