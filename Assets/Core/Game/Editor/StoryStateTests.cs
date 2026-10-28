using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace Core.Game.Editor
{
    public sealed class StoryStateTests
    {
        [Test]
        public void ValuesHaveExplicitMissingAndTypeContracts()
        {
            var story = new StoryState();
            Assert.That(story.TryGet<bool>("missing", out _), Is.False);
            Assert.Throws<KeyNotFoundException>(() => story.Get<bool>("missing"));
            story.Set("ready", false);
            story.Set("name", "Ada");
            story.Set("empty", "");
            Assert.That(story.Get<string>("name"), Is.EqualTo("Ada"));
            Assert.That(story.Get<string>("empty"), Is.Empty);
            Assert.That(story.Has("ready"), Is.True);
            Assert.That(story.Get<bool>("ready"), Is.False);
            Assert.Throws<InvalidOperationException>(() => story.Get<string>("ready"));
            Assert.Throws<InvalidOperationException>(() => story.TryGet<long>("ready", out _));
            Assert.Throws<InvalidOperationException>(() => story.Set("ready", 1L));
            Assert.Throws<ArgumentException>(() => story.Set("", true));
            Assert.Throws<ArgumentException>(() => story.Set<object>("null", null));
            Assert.Throws<ArgumentException>(() => story.Set("nan", double.NaN));
            Assert.Throws<ArgumentException>(() => story.Set("object", new object()));
            Assert.That(story.Remove("ready"), Is.True);
            Assert.That(story.Has("ready"), Is.False);
        }

        [Test]
        public void DictionaryWritesAndReadsAreDetached()
        {
            var story = new StoryState();
            var nested = new Dictionary<string, object> { ["stage"] = 2L };
            var input = new Dictionary<string, object> { ["quest"] = nested };
            story.Set("progress", input);
            nested["stage"] = 99L;
            var snapshot = story.Get<Dictionary<string, object>>("progress");
            var quest = (Dictionary<string, object>)snapshot["quest"];
            Assert.That(quest["stage"], Is.EqualTo(2L));
            quest["stage"] = 8L;
            Assert.That(((Dictionary<string, object>)story.Get<Dictionary<string, object>>("progress")["quest"])["stage"], Is.EqualTo(2L));
            input["cycle"] = input;
            Assert.Throws<ArgumentException>(() => story.Set("cycle", input));
        }

        [Test]
        public void NumbersConvertExactlyAndBooleansCanBeSetBothWays()
        {
            var story = new StoryState();
            story.Set("count", 3d);
            Assert.That(story.Get<long>("count"), Is.EqualTo(3L));
            story.Set("count", 3.5d);
            Assert.Throws<InvalidOperationException>(() => story.Get<long>("count"));
            story.Set("large", long.MaxValue);
            Assert.That(story.Get<long>("large"), Is.EqualTo(long.MaxValue));
            Assert.Throws<InvalidOperationException>(() => story.Get<double>("large"));
            story.Set("met", true);
            Assert.That(story.Get<bool>("met"), Is.True);
            story.Set("met", false);
            Assert.That(story.Has("met"), Is.True);
            Assert.That(story.Get<bool>("met"), Is.False);
            story.Remove("met");
            Assert.That(story.Has("met"), Is.False);
        }
    }
}
