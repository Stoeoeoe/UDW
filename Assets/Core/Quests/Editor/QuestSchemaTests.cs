using System;
using Core.Tile.Editor.Vulcanus;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Core.Quests.Editor
{
    /// <summary>The quest schema as the importer's own validator reads it, which differs from other validators.</summary>
    public sealed class QuestSchemaTests
    {
        private const string SchemaPath = VulcanusSchema.Folder + "/quest.schema.json";

        private static void Accepts(string start) => Assert.That(() => Check(start), Throws.Nothing, start);
        private static void Rejects(string start) => Assert.That(() => Check(start), Throws.TypeOf<FormatException>(), start);

        private static void Check(string start)
        {
            var quest = JObject.Parse(@"{ formatVersion: 1, id: 'test:quest', title: 'T', description: 'D', steps: [
                { id: 's', journal: 'J', objectives: [{ id: 'o', kind: 'condition', text: 'x', condition: 'true' }] }] }");
            quest["start"] = JObject.Parse(start);
            VulcanusSchema.Deserialize<JObject>(quest.ToString(), SchemaPath, "fixture");
        }

        [Test]
        public void EachStartMomentIsAcceptedWithItsOwnFiltersOnly()
        {
            Accepts("{ when: [{ on: 'gameStart' }, { on: 'newDay' }] }");
            Accepts("{ when: [{ on: 'newSeason' }, { on: 'newSeason', season: 'winter' }] }");
            Accepts("{ when: [{ on: 'everyTenMinutes' }], condition: 'true' }");
            Accepts("{ when: [{ on: 'divineFavour', deity: 'base:ceres', atLeast: 10 }] }");
            Accepts("{ when: [{ on: 'locationChanged', map: 'base:harbour' }] }");

            Rejects("{ when: [] }");
            Rejects("{ condition: 'true' }");
            Rejects("{ when: [{ on: 'sometime' }] }");
            Rejects("{ when: [{ on: 'newSeason', season: 'monsoon' }] }");
            Rejects("{ when: [{ on: 'newDay', map: 'base:harbour' }] }");
        }
    }
}
