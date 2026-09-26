using System.Collections;
using Character;
using Core.Context;
using Structures;
using UnityEngine;

namespace Interaction.Tools.Hammer
{
    public class HammerAction : ToolAction
    {
        private const string DefaultRepairSkillId = "base:hammer_mastery";

        [SerializeField, Min(0)] private int baseRepairAmount = 1;
        [SerializeField] private SkillDefinition repairSkill;

        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            if (snapshot.CurrentInteractable is IRepairable repairable)
            {
                var skill = repairSkill != null
                    ? repairSkill
                    : SkillDefinitions.Get(DefaultRepairSkillId);
                var skillLevel = Character.Skills.GetLevel(skill);
                var bonus = skill.GetValueAtLevel(skillLevel);
                var repairAmount = Mathf.Max(0, Mathf.RoundToInt(baseRepairAmount + bonus));
                repairable.Repair(repairAmount);
            }
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}
