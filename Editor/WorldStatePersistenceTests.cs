using System;
using System.Collections.Generic;
using System.IO;
using Core.Game;
using NUnit.Framework;

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
            world = new WorldSaveData()
        };
        data.player.skills.Add(new SkillLevelRecord { id = "hammer-mastery", level = 3 });
        data.story.flags.Add("met-blacksmith");
        data.world.locations.Add("farm", new Dictionary<string, WorldObjectState>
        {
            ["plot-1"] = new FarmlandState { plowed = true, irrigated = false }
        });

        try
        {
            GameSaveService.Save(slot, data);

            Assert.That(GameSaveService.TryLoad(slot, out var loaded), Is.True);
            Assert.That(loaded.schemaVersion, Is.EqualTo(GameSaveData.CurrentVersion));
            Assert.That(loaded.worldBaselineVersion, Is.EqualTo(1));
            Assert.That(loaded.player.skills, Has.Count.EqualTo(1));
            Assert.That(loaded.player.skills[0].id, Is.EqualTo("hammer-mastery"));
            Assert.That(loaded.player.skills[0].level, Is.EqualTo(3));
            Assert.That(loaded.story.flags, Is.EquivalentTo(new[] { "met-blacksmith" }));
            Assert.That(loaded.world.locations["farm"]["plot-1"], Is.TypeOf<FarmlandState>());
            var plot = (FarmlandState)loaded.world.locations["farm"]["plot-1"];
            Assert.That(plot.plowed, Is.True);
            Assert.That(plot.irrigated, Is.False);
        }
        finally
        {
            File.Delete(path);
            File.Delete(path + ".tmp");
            File.Delete(path + ".bak");
        }
    }
}
