using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Common.Editor;
using Core.TimeAndWeather;
using NUnit.Framework;
using static Core.Common.Editor.Reflect;

namespace Core.Game.Editor
{
    /// <summary>Slots are listed from headers, rebuilt when a header is stale, and deleted completely.</summary>
    public sealed class SaveSlotTests : GameTest
    {
        private readonly List<string> _slots = new();
        private GameSaveService _saves;

        [SetUp]
        public void SetUp() => _saves = Game.Get<GameSaveService>();

        [TearDown]
        public void DeleteSlots()
        {
            foreach (var slot in _slots) _saves.Delete(slot);
        }

        private string NewSlot()
        {
            var slot = "test-" + Guid.NewGuid().ToString("N");
            _slots.Add(slot);
            return slot;
        }

        private static GameSaveData Data(string saveName, int day = 3, string location = "test:farm")
        {
            var data = new GameSaveData { saveName = saveName };
            data.time.initialized = true;
            data.time.daysSinceStart = day;
            data.time.season = Season.Summer;
            data.time.dayOfSeason = day;
            data.time.hour = 9;
            data.time.minute = 30;
            data.player.Home = new PlayerHomeState("test:home", "test-bed");
            data.session.LocationId = location;
            return data;
        }

        private SaveSlotInfo Find(string slot) => _saves.ListSlots().Single(info => info.Slot == slot);

        [Test]
        public void SavingWritesAHeaderThatSummarizesTheSave()
        {
            var slot = NewSlot();
            var savedAt = new DateTime(2026, 11, 5, 12, 0, 0, DateTimeKind.Utc);
            Set(_saves, "_utcNow", (Func<DateTime>)(() => savedAt));
            _saves.Save(slot, Data("Hillside farm", day: 5));

            var info = Find(slot);
            Assert.That(info.IsReadable, Is.True);
            Assert.That(info.DisplayName, Is.EqualTo("Hillside farm"));
            Assert.That(info.Header.SavedAtUtc, Is.EqualTo(savedAt));
            Assert.That(info.Header.daysSinceStart, Is.EqualTo(5));
            Assert.That(info.Header.season, Is.EqualTo(Season.Summer));
            Assert.That(info.Header.hour, Is.EqualTo(9));
            Assert.That(info.Header.minute, Is.EqualTo(30));
            Assert.That(info.Header.locationId, Is.EqualTo("test:farm"));
        }

        [Test]
        public void ASlotWithoutASaveNameIsDisplayedByItsSlotId()
        {
            var slot = NewSlot();
            _saves.Save(slot, Data(null));
            Assert.That(Find(slot).DisplayName, Is.EqualTo(slot));
        }

        [Test]
        public void BlankSaveNamesAreRejected()
        {
            var data = Data(" ");
            Assert.Throws<FormatException>(() => _saves.Save(NewSlot(), data));
        }

        [TestCase("missing")]
        [TestCase("corrupt")]
        [TestCase("stale")]
        public void AnUnusableHeaderIsRebuiltFromTheSave(string fault)
        {
            var slot = NewSlot();
            _saves.Save(slot, Data("Rebuilt", day: 7));
            var headerPath = GameSaveService.GetSavePath(slot).Replace(".json", ".meta.json");
            switch (fault)
            {
                case "missing": File.Delete(headerPath); break;
                case "corrupt": File.WriteAllText(headerPath, "{ not json"); break;
                case "stale": File.SetLastWriteTimeUtc(headerPath, File.GetLastWriteTimeUtc(headerPath).AddMinutes(-5)); break;
            }

            var info = Find(slot);
            Assert.That(info.IsReadable, Is.True);
            Assert.That(info.Header.saveName, Is.EqualTo("Rebuilt"));
            Assert.That(info.Header.daysSinceStart, Is.EqualTo(7));
            Assert.That(File.Exists(headerPath), Is.True, "The rebuilt header is written back.");
        }

        [Test]
        public void ACorruptSaveIsListedAsUnreadableWithoutHidingTheOtherSlots()
        {
            var good = NewSlot();
            var bad = NewSlot();
            _saves.Save(good, Data("Good"));
            _saves.Save(bad, Data("Bad"));
            File.Delete(GameSaveService.GetSavePath(bad).Replace(".json", ".meta.json"));
            File.WriteAllText(GameSaveService.GetSavePath(bad), "{ this is not a save");

            var corrupt = Find(bad);
            Assert.That(corrupt.IsReadable, Is.False);
            Assert.That(corrupt.Error, Is.Not.Empty);
            Assert.That(corrupt.Header, Is.Null);
            Assert.That(corrupt.DisplayName, Is.EqualTo(bad));
            Assert.That(Find(good).IsReadable, Is.True);
        }

        [Test]
        public void ASaveRejectedByValidationIsListedAsUnreadable()
        {
            var slot = NewSlot();
            _saves.Save(slot, Data("Invalid"));
            var path = GameSaveService.GetSavePath(slot);
            File.Delete(path.Replace(".json", ".meta.json"));
            File.WriteAllText(path, File.ReadAllText(path).Replace("\"schemaVersion\": 1", "\"schemaVersion\": 99"));
            StringAssert.Contains("99", Find(slot).Error);
        }

        [Test]
        public void DeletingASlotRemovesItsSaveHeaderAndBackup()
        {
            var slot = NewSlot();
            _saves.Save(slot, Data("First"));
            _saves.Save(slot, Data("Second")); // The replacement keeps a backup of the first save.
            var path = GameSaveService.GetSavePath(slot);
            Assert.That(File.Exists(path + ".bak"), Is.True);

            _saves.Delete(slot);
            Assert.That(File.Exists(path), Is.False);
            Assert.That(File.Exists(path + ".bak"), Is.False);
            Assert.That(File.Exists(path.Replace(".json", ".meta.json")), Is.False);
            Assert.That(_saves.ListSlots().Any(info => info.Slot == slot), Is.False);
            Assert.DoesNotThrow(() => _saves.Delete(slot), "Deleting a missing slot is harmless.");
        }

        [Test]
        public void LastPlayedIsTheNewestReadableSlot()
        {
            SaveSlotInfo Readable(string slot, int hour) => new(slot, new SaveSlotHeader
                { savedAtUtcTicks = new DateTime(2026, 1, 1, hour, 0, 0, DateTimeKind.Utc).Ticks }, null);
            var slots = new[]
            {
                Readable("old", 8), Readable("newest", 20), Readable("middle", 12),
                new SaveSlotInfo("broken", null, "corrupt")
            };
            Assert.That(SaveSlotInfo.LastPlayed(slots).Slot, Is.EqualTo("newest"));
            Assert.That(SaveSlotInfo.LastPlayed(new[] { slots[3] }), Is.Null);
            Assert.That(SaveSlotInfo.LastPlayed(Array.Empty<SaveSlotInfo>()), Is.Null);
        }

        [Test]
        public void NextSlotIdSkipsSlotsThatExist()
        {
            var first = _saves.NextSlotId();
            Assert.That(File.Exists(GameSaveService.GetSavePath(first)), Is.False);
            _slots.Add(first);
            _saves.Save(first, Data("Taken"));
            var second = _saves.NextSlotId();
            Assert.That(second, Is.Not.EqualTo(first));
            Assert.That(File.Exists(GameSaveService.GetSavePath(second)), Is.False);
        }

        [Test]
        public void TheSessionTracksItsCurrentSlotAcrossSaveAndLoad()
        {
            var session = Game.Get<GameStateManager>();
            Game.Get<PlayerStateManager>().InitializeHome();
            Game.State.Time.initialized = true;
            Game.State.Time.daysSinceStart = 1;
            Game.State.Time.dayOfSeason = 1;
            Game.State.Time.hour = 6;
            Assert.That(session.CurrentSlot, Is.Null);
            Assert.Throws<InvalidOperationException>(() => session.Save());

            var slot = NewSlot();
            session.Save(slot);
            Assert.That(session.CurrentSlot, Is.EqualTo(slot));
            Game.State.Time.hour = 9;
            session.Save();
            Assert.That(_saves.TryLoad(slot, out var saved), Is.True);
            Assert.That(saved.time.hour, Is.EqualTo(9));

            var other = NewSlot();
            _saves.Save(other, Data("Other"));
            Assert.That(session.Load(other), Is.True);
            Assert.That(session.CurrentSlot, Is.EqualTo(other));
            Assert.That(session.Load(NewSlot()), Is.False, "A missing slot is not loaded.");
            Assert.That(session.CurrentSlot, Is.EqualTo(other));
        }

        [Test]
        public void ContinueLoadsTheMostRecentlySavedSlot()
        {
            var session = Game.Get<GameStateManager>();
            var older = NewSlot();
            var newer = NewSlot();
            var now = DateTime.UtcNow.AddYears(1); // Later than any real save on this machine.
            Set(_saves, "_utcNow", (Func<DateTime>)(() => now));
            _saves.Save(older, Data("Older"));
            now = now.AddHours(1);
            _saves.Save(newer, Data("Newer"));

            Assert.That(session.Continue(), Is.True);
            Assert.That(session.CurrentSlot, Is.EqualTo(newer));
        }
    }
}
