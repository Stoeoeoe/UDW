using Core.Events;

namespace Character
{
    public struct SkillLevelChangedEvent
    {
        public CharacterSkills Skills;
        public string SkillId;
        public int NewLevel;

        public static void Trigger(CharacterSkills skills, string skillId, int newLevel)
            => EventBus<SkillLevelChangedEvent>.Raise(new SkillLevelChangedEvent
            {
                Skills = skills,
                SkillId = skillId,
                NewLevel = newLevel
            });
    }
}
