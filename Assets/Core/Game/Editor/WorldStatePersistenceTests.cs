using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Inventory;
using Core.Location;
using Core.Spawning;
using Core.TimeAndWeather;
using Interaction;
using NUnit.Framework;
using Plants;
using Sirenix.Serialization;
using UnityEngine;
using static Core.Common.Editor.Reflect;
using Object = UnityEngine.Object;

namespace Core.Game.Editor
{
    public sealed class WorldStatePersistenceTests : GameTest
    {

        [Test]
        public void GlobalObjectsCanBeStoredEnumeratedAndRemovedWithoutALocation()
        {
            var world = new WorldState();
            var id = Guid.NewGuid().ToString("D");
            world.Set(id, new InteractableState { uses = 2 });
            Assert.That(world.TryGet(id, out InteractableState state), Is.True);
            Assert.That(state.uses, Is.EqualTo(2));
            var entry = world.GetStates<InteractableState>().Single();
            Assert.That(entry.LocationId, Is.Null);
            Assert.That(entry.ObjectId, Is.EqualTo(id));
            Assert.That(entry.State, Is.SameAs(state));
            Assert.That(world.Remove(id), Is.True);
            Assert.That(world.TryGet(id, out InteractableState _), Is.False);
        }

        [Test]
        public void GlobalIdsDoNotCollideWithLocationScopedObjectIds()
        {
            var world = new WorldState();
            var id = Guid.NewGuid().ToString("D");
            world.Set(id, new InteractableState { uses = 2 });
            world.Set("farm", id, new FarmlandState { plowed = true });
            Assert.That(world.TryGet(id, out InteractableState interaction), Is.True);
            Assert.That(interaction.uses, Is.EqualTo(2));
            Assert.That(world.TryGet("farm", id, out FarmlandState farmland), Is.True);
            Assert.That(farmland.plowed, Is.True);
            Assert.Throws<InvalidOperationException>(() => world.Set(id, new FarmlandState()));
            Assert.That(world.TryGet(id, out FarmlandState _), Is.False);
        }

        [Test]
        public void GlobalWrappersUseTheSameStoreAndRemoveTheEmptyBucket()
        {
            var world = new WorldState();
            var state = new InteractableState { uses = 1 };
            world.Set("object", state);
            Assert.That(world.TryGet(WorldState.Global, "object", out InteractableState found), Is.True);
            Assert.That(found, Is.SameAs(state));
            Assert.That(world.GetStates<InteractableState>(WorldState.Global).Single().Value, Is.SameAs(state));
            Assert.That(world.Remove("object"), Is.True);
            var locations = (Dictionary<string, Dictionary<string, WorldObjectState>>)typeof(WorldState)
                .GetField("_locations", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(world);
            Assert.That(locations.ContainsKey(WorldState.Global), Is.False);
        }

        [Test]
        public void LookupsSkipMissingWrongAndNullTypesWithoutThrowing()
        {
            var world = new WorldState();
            world.Set("object", new InteractableState());
            Assert.That(world.TryGet("object", out FarmlandState _), Is.False);
            Assert.That(world.TryGet("", out InteractableState _), Is.False);
            Assert.That(world.Remove(""), Is.False);
            var locations = (Dictionary<string, Dictionary<string, WorldObjectState>>)typeof(WorldState)
                .GetField("_locations", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(world);
            locations[WorldState.Global]["object"] = null;
            Assert.That(world.TryGet("object", out InteractableState _), Is.False);
            Assert.That(world.GetStates<InteractableState>(), Is.Empty);
            world.Set("object", new InteractableState { uses = 3 });
            Assert.That(world.TryGet("object", out InteractableState repaired), Is.True);
            Assert.That(repaired.uses, Is.EqualTo(3));
        }

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
        public void SaveValidationRejectsMissingOrNegativeHealth()
        {
            var data = new GameSaveData();
            data.player.Health = null;
            Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>()));
            data.player.Health = new HealthState { Initialized = true, Current = -1 };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("health"));
        }

        [Test]
        public void SaveValidationRejectsMissingOrNegativeStamina()
        {
            var data = new GameSaveData();
            data.player.Stamina = null;
            Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>()));
            data.player.Stamina = new StaminaState { Initialized = true, Current = -1 };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("stamina"));
        }

        [Test]
        public void SaveValidationRejectsMissingOrMalformedBoostState()
        {
            var data = new GameSaveData();
            data.player.Boosts = null;
            Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>()));
            data.player.Boosts = new CharacterBoostState();
            data.player.Boosts.Active["sleep:well-rested"] = new ActiveAttributeBoost { ExpiresAtMinute = -1, Bonuses = new[] { new AppliedAttributeBonus { Attribute = CharacterAttributeType.MaxStamina, Percent = 0.25f } } };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("boost"));
            data.player.Boosts.Active.Clear();
            data.player.Boosts.Active[""] = new ActiveAttributeBoost { ExpiresAtMinute = 60, Bonuses = new[] { new AppliedAttributeBonus { Attribute = CharacterAttributeType.MaxStamina, Percent = 0.25f } } };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("boost"));
        }

        [TestCase("missing")]
        [TestCase("empty")]
        [TestCase("attribute")]
        [TestCase("negative-flat")]
        [TestCase("negative-percent")]
        [TestCase("nan")]
        [TestCase("infinity")]
        public void SaveValidationRejectsMalformedBoostSnapshots(string fault)
        {
            var data = new GameSaveData();
            var bonus = new AppliedAttributeBonus { Attribute = CharacterAttributeType.MaxStamina, Percent = 0.25f };
            switch (fault)
            {
                case "attribute": bonus.Attribute = (CharacterAttributeType)999; break;
                case "negative-flat": bonus.Flat = -1; break;
                case "negative-percent": bonus.Percent = -0.1f; break;
                case "nan": bonus.Flat = float.NaN; break;
                case "infinity": bonus.Percent = float.PositiveInfinity; break;
            }
            var boost = new ActiveAttributeBoost { ExpiresAtMinute = 60, Bonuses = new[] { bonus } };
            if (fault == "missing") boost.Bonuses = null;
            if (fault == "empty") boost.Bonuses = Array.Empty<AppliedAttributeBonus>();
            data.player.Boosts.Active["item:test:tonic"] = boost;
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("boost"));
        }

        [TestCase(-1)]
        [TestCase(int.MaxValue)]
        public void SaveValidationRejectsNegativeOrOverflowingOvercharge(int surplus)
        {
            var data = new GameSaveData();
            data.player.Health = new HealthState { Initialized = true, Current = 100, Overcharge = surplus };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("health"));
            data.player.Health.Overcharge = 0;
            data.player.Stamina = new StaminaState { Initialized = true, Current = 100, Overcharge = surplus };
            Assert.That(Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>())).Message, Does.Contain("stamina"));
        }

        [Test]
        public void SessionResumePointAndWeatherRoundTrip()
        {
            var slot = "test-" + Guid.NewGuid().ToString("N");
            var data = new GameSaveData();
            data.time.initialized = true;
            data.time.daysSinceStart = 3;
            data.time.dayOfSeason = 3;
            data.player.Home = new PlayerHomeState("test:home", "test-bed");
            data.session.LocationId = "test:farm";
            data.session.Position = new Vector2(12.5f, -3.25f);
            data.session.Facing = Vector2.left;
            data.session.WeatherId = "test:rain";
            data.session.WeatherDay = 3;
            try
            {
                Game.Get<GameSaveService>().Save(slot, data);
                Assert.That(Game.Get<GameSaveService>().TryLoad(slot, out var loaded), Is.True);
                Assert.That(loaded.session.LocationId, Is.EqualTo("test:farm"));
                Assert.That(loaded.session.Position, Is.EqualTo(new Vector2(12.5f, -3.25f)));
                Assert.That(loaded.session.Facing, Is.EqualTo(Vector2.left));
                Assert.That(loaded.session.WeatherId, Is.EqualTo("test:rain"));
                Assert.That(loaded.session.WeatherDay, Is.EqualTo(3));
            }
            finally { File.Delete(GameSaveService.GetSavePath(slot)); }
        }

        [TestCase("missing")]
        [TestCase("blank-location")]
        [TestCase("nan-position")]
        [TestCase("infinite-facing")]
        [TestCase("blank-weather")]
        [TestCase("negative-weather-day")]
        public void SaveValidationRejectsMalformedSessionState(string fault)
        {
            var data = new GameSaveData();
            switch (fault)
            {
                case "missing": data.session = null; break;
                case "blank-location": data.session.LocationId = " "; break;
                case "nan-position": data.session.Position = new Vector2(float.NaN, 0); break;
                case "infinite-facing": data.session.Facing = new Vector2(0, float.PositiveInfinity); break;
                case "blank-weather": data.session.WeatherId = ""; break;
                case "negative-weather-day": data.session.WeatherDay = -1; break;
            }
            Assert.Throws<FormatException>(() => data.Validate(Game.Get<CharacterCatalog>(), Game.Get<ItemCatalog>()));
        }

        [Test]
        public void SavingInAReadyLocationCapturesTheLocationAndPlayerPlacement()
        {
            var session = Game.Get<GameStateManager>();
            Game.Get<PlayerStateManager>().InitializeHome();
            Game.State.Time.initialized = true;
            Game.State.Time.daysSinceStart = 1;
            Game.State.Time.dayOfSeason = 1;
            Game.State.Time.hour = 6;
            var location = Game.Asset<LocationData>();
            location.id = "test:farm";
            Game.Location = location;
            Game.Ready = true;
            var player = Game.CreatePlayer();
            player.transform.position = new Vector3(4.5f, -2f, 0);
            player.Orientation.ForceDirection(Vector2.left);
            var slot = "test-" + Guid.NewGuid().ToString("N");
            try
            {
                session.Save(slot);
                Assert.That(Game.Get<GameSaveService>().TryLoad(slot, out var loaded), Is.True);
                Assert.That(loaded.session.LocationId, Is.EqualTo("test:farm"));
                Assert.That(loaded.session.Position, Is.EqualTo(new Vector2(4.5f, -2f)));
                Assert.That(loaded.session.Facing, Is.EqualTo(Vector2.left));
            }
            finally { File.Delete(GameSaveService.GetSavePath(slot)); }
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
            data.player.Home = new PlayerHomeState("test:home", "test-bed");
            data.player.Stamina = new StaminaState { Initialized = true, Current = 100, Overcharge = 20 };
            data.player.Health = new HealthState { Initialized = true, Current = 100, Overcharge = 30 };
            data.player.Boosts.Active["sleep:well-rested"] = new ActiveAttributeBoost { ExpiresAtMinute = data.time.TotalMinutes + 1440, Bonuses = new[] { new AppliedAttributeBonus { Attribute = CharacterAttributeType.MaxStamina, Flat = 5, Percent = 0.25f } } };
            data.player.Inventory.StartingLoadoutApplied = true;
            data.player.Inventory.Toolbelt = new[] { "base:hammer", null, null };
            data.player.Inventory.SelectedItemId = "base:hammer";
            data.player.Inventory.ToolCharges["test:jug"] = new ToolChargeState(30) { Current = 7 };
            data.player.Inventory.Equipment["base:head"] = new InventorySlotState("test:hat", 1);
            data.player.Inventory.Slots = new[]
            {
                new InventorySlotState("base:hammer", 1), default,
                new InventorySlotState("missing-mod:item", 7)
            };
            Call(data.player.Wallet, "SetBalance", 1234L);
            typeof(CharacterSkills).GetMethod("RestoreLevels", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(data.player.Skills, new object[] { new[] { new KeyValuePair<string, int>("hammer-mastery", 3) } });
            Call(data.player.Favour, "SetFavour", "mars", 12);
            data.story.Set("met-blacksmith", true);
            data.story.Set("story:false", false);
            data.story.Set("story:string", "Ada");
            data.story.Set("story:empty", "");
            data.story.Set("story:long", long.MaxValue);
            data.story.Set("story:double", 12.5d);
            data.story.Set("story:object", new Dictionary<string, object> { ["quest"] = new Dictionary<string, object> { ["stage"] = 2L, ["name"] = "intro" } });
            data.story.CompletedCutscenes.Add("test:confession");
            data.world.Set("farm", "plot-1", new FarmlandState { plowed = true, irrigated = false });
            data.world.Set("farm", "plant:1,2", new PlantState("lentils") { daysPassedSincePlanting = 3 });
            var prayerDeadline = new GameCalendar(6, 14, Season.Spring, Season.Summer, Season.Autumn, Season.Winter)
                .GetNextBoundaryMinute(data.time, GameTimeBoundary.NextDay);
            var shrineId = Guid.NewGuid().ToString("D");
            data.world.Set(shrineId, new InteractableState
            {
                uses = 2,
                availableAtMinute = prayerDeadline
            });
            var chestId = Guid.NewGuid().ToString("D");
            data.world.Set("farm", chestId, new TestChestState
            {
                prefabId = "base:test-chest", position = new Vector3(3, 5, 0),
                rotation = Quaternion.Euler(0, 0, 45), authored = true,
                coins = 12, interaction = new InteractableState { uses = 1, availableAtMinute = prayerDeadline }
            });

            data.world.Set("farm", "removed-authored", new SpawnedObjectState
                { prefabId = "base:test-chest", authored = true, removed = true });

            try
            {
                Game.Get<GameSaveService>().Save(slot, data);

                Assert.That(Game.Get<GameSaveService>().TryLoad(slot, out var loaded), Is.True);
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
                Assert.That(loaded.player.Stamina.Initialized, Is.True);
                Assert.That(loaded.player.Stamina.Current, Is.EqualTo(100));
                Assert.That(loaded.player.Stamina.Overcharge, Is.EqualTo(20));
                Assert.That(loaded.player.Health.Initialized, Is.True);
                Assert.That(loaded.player.Health.Current, Is.EqualTo(100));
                Assert.That(loaded.player.Health.Overcharge, Is.EqualTo(30));
                Assert.That(loaded.player.Boosts.Active["sleep:well-rested"].ExpiresAtMinute, Is.EqualTo(data.time.TotalMinutes + 1440));
                var bonus = loaded.player.Boosts.Active["sleep:well-rested"].Bonuses[0];
                Assert.That(bonus.Attribute, Is.EqualTo(CharacterAttributeType.MaxStamina));
                Assert.That(bonus.Flat, Is.EqualTo(5));
                Assert.That(bonus.Percent, Is.EqualTo(0.25f));
                Assert.That(loaded.player.Home.LocationId, Is.EqualTo("test:home"));
                Assert.That(loaded.player.Home.BedId, Is.EqualTo("test-bed"));
                Assert.That(loaded.player.Inventory.StartingLoadoutApplied, Is.True);
                Assert.That(loaded.player.Inventory.Toolbelt[0], Is.EqualTo("base:hammer"));
                Assert.That(loaded.player.Inventory.SelectedItemId, Is.EqualTo("base:hammer"));
                Assert.That(loaded.player.Inventory.ToolCharges["test:jug"].Capacity, Is.EqualTo(30));
                Assert.That(loaded.player.Inventory.ToolCharges["test:jug"].Current, Is.EqualTo(7));
                Assert.That(loaded.player.Inventory.Equipment["base:head"].ItemId, Is.EqualTo("test:hat"));
                Assert.That(loaded.player.Inventory.Slots.Length, Is.EqualTo(3));
                Assert.That(loaded.player.Inventory.Slots[0].ItemId, Is.EqualTo("base:hammer"));
                Assert.That(loaded.player.Inventory.Slots[1].Quantity, Is.Zero);
                Assert.That(loaded.player.Inventory.Slots[2].ItemId, Is.EqualTo("missing-mod:item"));
                Assert.That(loaded.player.Inventory.Slots[2].Quantity, Is.EqualTo(7));
                Assert.That(loaded.player.Wallet.Balance, Is.EqualTo(1234));
                Assert.That(loaded.story.Has("met-blacksmith"), Is.True);
                Assert.That(loaded.story.Get<bool>("story:false"), Is.False);
                Assert.That(loaded.story.Get<string>("story:string"), Is.EqualTo("Ada"));
                Assert.That(loaded.story.Get<string>("story:empty"), Is.Empty);
                Assert.That(loaded.story.Get<long>("story:long"), Is.EqualTo(long.MaxValue));
                Assert.That(loaded.story.Get<double>("story:double"), Is.EqualTo(12.5d));
                Assert.That(((Dictionary<string, object>)loaded.story.Get<Dictionary<string, object>>("story:object")["quest"])["stage"], Is.EqualTo(2L));
                Assert.That(loaded.story.CompletedCutscenes.Contains("test:confession"), Is.True);
                Assert.That(loaded.world.TryGet("farm", "plot-1", out FarmlandState plot), Is.True);
                Assert.That(plot.plowed, Is.True);
                Assert.That(plot.irrigated, Is.False);
                Assert.That(loaded.world.TryGet("farm", "plant:1,2", out PlantState plant), Is.True);
                Assert.That(plant.plantID, Is.EqualTo("lentils"));
                Assert.That(plant.daysPassedSincePlanting, Is.EqualTo(3));
                Assert.That(loaded.world.TryGet(shrineId, out InteractableState interaction), Is.True);
                Assert.That(interaction.uses, Is.EqualTo(2));
                Assert.That(interaction.IsCoolingDown(loaded.time.TotalMinutes), Is.True);
                Assert.That(interaction.availableAtMinute, Is.EqualTo(prayerDeadline));
                Assert.That(loaded.world.TryGet("farm", chestId, out TestChestState chest), Is.True);
                Assert.That(chest.prefabId, Is.EqualTo("base:test-chest"));
                Assert.That(chest.position, Is.EqualTo(new Vector3(3, 5, 0)));
                Assert.That(chest.authored, Is.True);
                Assert.That(Quaternion.Angle(chest.rotation, Quaternion.Euler(0, 0, 45)), Is.LessThan(0.01f));
                Assert.That(loaded.world.TryGet("farm", "removed-authored", out SpawnedObjectState removed), Is.True);
                Assert.That(removed.removed, Is.True);
                Assert.That(chest.coins, Is.EqualTo(12));
                Assert.That(chest.interaction.uses, Is.EqualTo(1));
                Assert.That(chest.interaction.availableAtMinute, Is.EqualTo(prayerDeadline));
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
            foreach (var property in typeof(GameState).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var field = typeof(GameSaveData).GetField(property.Name.ToLowerInvariant(), BindingFlags.Public | BindingFlags.Instance);
                Assert.That(field, Is.Not.Null, $"GameState.{property.Name} has no persisted section.");
                Assert.That(field.FieldType, Is.EqualTo(property.PropertyType));
            }
            foreach (var field in typeof(GameSaveData).GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (field.Name == nameof(GameSaveData.schemaVersion) || field.Name == nameof(GameSaveData.worldBaselineVersion) ||
                    field.Name == nameof(GameSaveData.saveName))
                    continue;
                var name = char.ToUpperInvariant(field.Name[0]) + field.Name.Substring(1);
                Assert.That(facade.GetProperty(name, BindingFlags.Public | BindingFlags.Instance), Is.Not.Null,
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
            data.player.Home = new PlayerHomeState("test:home", "test-bed");
            data.time.initialized = true;
            data.time.daysSinceStart = 1;
            data.time.dayOfSeason = 1;
            var gameObject = new GameObject("Save test character");
            gameObject.SetActive(false);
            var character = Game.Add<GameCharacter>(gameObject);
            Call(data.player.Skills, "BindCharacter", character);
            try
            {
                Game.Get<GameSaveService>().Save(slot, data);
                Assert.That(Game.Get<GameSaveService>().TryLoad(slot, out var loaded), Is.True);
                Assert.That(loaded.player.Skills, Is.Not.Null);
            }
            finally
            {
                Call(data.player.Skills, "UnbindCharacter", character);
                Object.DestroyImmediate(gameObject);
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

        [Serializable]
        public sealed class TestChestState : SpawnedObjectState
        {
            public int coins;
        }
    }
}
