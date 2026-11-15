using System;
using Core.Common.Editor;
using Core.Quests;
using Core.Routines;
using NUnit.Framework;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>The conversions and rules definitions get from <see cref="VulcanusJson"/>, each checked once.</summary>
    public sealed class VulcanusJsonTests : GameTest
    {
        private const string Routine = "{ id: 'test:routine', character: 'test:fabia', home: { map: 'test:map', anchor: 'bed' }, variants: [{ id: 'default', goals: [{0}] }] }";

        [Test]
        public void ConvertsTimesHomeAndKinds()
        {
            var routine = VulcanusJson.Populate(Game.Asset<RoutineDefinition>(), Routine.Replace("{0}",
                "{ id: 'out', departAt: '08:05', destination: { map: 'test:map', anchor: 'well' } }, { id: 'back', departAt: '18:00', destination: 'home' }"));
            var goals = routine.Variants[0].Goals;
            Assert.That(goals[0].DepartAt, Is.EqualTo(8 * 60 + 5));
            Assert.That(goals[0].Destination.ToString(), Is.EqualTo("test:map/well"));
            Assert.That(goals[1].ToHome, Is.True);

            var quest = VulcanusJson.Populate(Game.Asset<QuestDefinition>(),
                "{ id: 'test:quest', steps: [{ id: 'go', objectives: [{ id: 'reach', kind: 'reach' }], deadline: { days: 1, at: '18:30' } }] }");
            Assert.That(quest.Steps[0].Objectives[0].Kind, Is.EqualTo(QuestObjectiveKind.Reach));
            Assert.That(quest.Steps[0].DeadlineMinute, Is.EqualTo(18 * 60 + 30));
        }

        [Test]
        public void LuaFieldsMustParse()
        {
            Assert.That(() => VulcanusJson.Populate(Game.Asset<RoutineDefinition>(), Routine.Replace("{0}",
                    "{ id: 'out', departAt: '08:00', destination: 'home', condition: 'GameState.Story.Has(' }")),
                Throws.TypeOf<ArgumentException>().With.Message.Contains("Variants[0].Goals[0].Condition: Invalid Lua"));
        }
    }
}
