using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Character;
using Core.Divinity;
using Core.TimeAndWeather;
using Interaction;
using NUnit.Framework;
using Plants;
using Sirenix.Serialization;
using UnityEngine;

namespace Core.Game.Editor
{
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
        public void CooldownUsesElapsedInGameHoursAcrossDayBoundary()
        {
            var time = new GameTimeState { initialized = true, daysSinceStart = 5, hour = 18, minute = 30 };
            var state = new InteractableState { availableAtMinute = time.TotalMinutes + 24 * 60 };

            time.daysSinceStart = 6;
            time.hour = 6;
            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.True);
            time.hour = 18;
            time.minute = 29;
            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.True);
            time.minute = 30;
            Assert.That(state.IsCoolingDown(time.TotalMinutes), Is.False);
        }

        [Test]
        public void LimitedUsesBecomeUsedUpAtTheConfiguredMaximum()
        {
            var state = new InteractableState { uses = 1 };

            Assert.That(state.IsUsedUp(2), Is.False);
            Assert.That(state.IsUsedUp(1), Is.True);
            Assert.That(state.IsUsedUp(-1), Is.False);
        }

        [Test]
        public void SaveAndLoadRoundTripWorldPlayerAndStory()
        {
            var slot = "test-" + Guid.NewGuid().ToString("N");
            var path = GameSaveService.GetSavePath(slot);
            var data = new GameSaveData();
            data.time.initialized = true;
            data.time.daysSinceStart = 4;
            data.time.season = Season.Spring;
            data.time.dayOfSeason = 8;
            data.time.hour = 14;
            data.time.minute = 20;
            data.time.secondsTowardNextMinute = 2.5f;
            data.player.StaminaInitialized = true;
            data.player.CurrentStamina = 42;
            typeof(CharacterSkills).GetMethod("RestoreLevels", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.Invoke(data.player.Skills, new object[] { new[] { new KeyValuePair<string, int>("hammer-mastery", 3) } });
            typeof(DivineFavourState).GetMethod("SetFavour", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.Invoke(data.player.Favour, new object[] { "mars", 12 });
            data.story.SetFlag("met-blacksmith");
            data.world.Set("farm", "plot-1", new FarmlandState { plowed = true, irrigated = false });
            data.world.Set("farm", "plant:1,2", new PlantState("lentils") { daysPassedSincePlanting = 3 });
            var prayerDeadline = new GameCalendar(6, 14, Season.Spring, Season.Summer, Season.Autumn, Season.Winter)
                .GetNextBoundaryMinute(data.time, GameTimeBoundary.NextDay);
            data.world.Set("farm", "interactable:shrine-1", new InteractableState
            {
                uses = 2,
                availableAtMinute = prayerDeadline
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
                Assert.That(loaded.player.Skills.GetLevel("hammer-mastery"), Is.EqualTo(3));
                Assert.That(loaded.player.Favour.GetFavour("mars"), Is.EqualTo(12));
                Assert.That(loaded.player.StaminaInitialized, Is.True);
                Assert.That(loaded.player.CurrentStamina, Is.EqualTo(42));
                Assert.That(loaded.story.HasFlag("met-blacksmith"), Is.True);
                Assert.That(loaded.world.TryGet("farm", "plot-1", out FarmlandState plot), Is.True);
                Assert.That(plot.plowed, Is.True);
                Assert.That(plot.irrigated, Is.False);
                Assert.That(loaded.world.TryGet("farm", "plant:1,2", out PlantState plant), Is.True);
                Assert.That(plant.plantID, Is.EqualTo("lentils"));
                Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(3));
                Assert.That(loaded.world.TryGet("farm", "interactable:shrine-1", out InteractableState interaction), Is.True);
                Assert.That(interaction.uses, Is.EqualTo(2));
                Assert.That(interaction.IsCoolingDown(loaded.time.TotalMinutes), Is.True);
                Assert.That(interaction.availableAtMinute, Is.EqualTo(prayerDeadline));
                loaded.time.daysSinceStart++;
                loaded.time.hour = 6;
                loaded.time.minute = 0;
                Assert.That(interaction.IsCoolingDown(loaded.time.TotalMinutes), Is.False);
            }
            finally
            {
                File.Delete(path);
                File.Delete(path + ".tmp");
                File.Delete(path + ".bak");
            }
        }

        [Test]
        public void EveryGameStateSectionIsPartOfTheSaveRoot()
        {
            var facade = typeof(GameState);
            foreach (var property in typeof(GameState).GetProperties(BindingFlags.Public | BindingFlags.Static))
            {
                var field = typeof(GameSaveData).GetField(property.Name.ToLowerInvariant(), BindingFlags.Public | BindingFlags.Instance);
                Assert.That(field, Is.Not.Null, $"GameState.{property.Name} has no persisted section.");
                Assert.That(field.FieldType, Is.EqualTo(property.PropertyType));
            }
            foreach (var field in typeof(GameSaveData).GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (field.Name == nameof(GameSaveData.schemaVersion) || field.Name == nameof(GameSaveData.worldBaselineVersion))
                    continue;
                var name = char.ToUpperInvariant(field.Name[0]) + field.Name.Substring(1);
                Assert.That(facade.GetProperty(name, BindingFlags.Public | BindingFlags.Static), Is.Not.Null,
                    $"Save section '{field.Name}' is not exposed through GameState.");
            }

            AssertSerializableFields(typeof(GameSaveData), new HashSet<Type>());
        }

        [Test]
        public void SavingBoundSkillsDoesNotSerializeTheSceneCharacter()
        {
            var slot = "test-" + Guid.NewGuid().ToString("N");
            var path = GameSaveService.GetSavePath(slot);
            var data = new GameSaveData();
            data.time.initialized = true;
            data.time.daysSinceStart = 1;
            data.time.dayOfSeason = 1;
            var gameObject = new GameObject("Save test character");
            gameObject.SetActive(false);
            var character = gameObject.AddComponent<GameCharacter>();
            typeof(CharacterSkills).GetMethod("BindCharacter", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.Invoke(data.player.Skills, new object[] { character });
            try
            {
                GameSaveService.Save(slot, data);
                Assert.That(GameSaveService.TryLoad(slot, out var loaded), Is.True);
                Assert.That(loaded.player.Skills, Is.Not.Null);
            }
            finally
            {
                typeof(CharacterSkills).GetMethod("UnbindCharacter", BindingFlags.Instance | BindingFlags.NonPublic)
                    ?.Invoke(data.player.Skills, new object[] { character });
                UnityEngine.Object.DestroyImmediate(gameObject);
                File.Delete(path);
                File.Delete(path + ".tmp");
                File.Delete(path + ".bak");
            }
        }

        private static void AssertSerializableFields(Type type, HashSet<Type> visited)
        {
            if (type.IsEnum || !visited.Add(type)) return;
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic |
                                                 BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var persisted = field.IsPublic || field.IsDefined(typeof(OdinSerializeAttribute), false);
                if (field.IsPublic)
                    Assert.That(field.IsNotSerialized, Is.False, $"Public state field {type.Name}.{field.Name} must be persisted.");
                Assert.That(persisted || field.IsNotSerialized, Is.True,
                    $"{type.Name}.{field.Name} must be persisted or marked [NonSerialized].");
                if (persisted && field.FieldType.Assembly == typeof(GameSaveData).Assembly)
                    AssertSerializableFields(field.FieldType, visited);
            }
        }
    }
}
