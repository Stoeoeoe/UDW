using System.Threading;
using Character;
using Core.Context;
using Structures;
using UnityEngine;
using VContainer;

namespace Interaction.Tools.Hammer
{
    public class HammerAction : ToolAction
    {
        [Inject] private SkillDefinitions _skillDefinitions;

        private const string DefaultRepairSkillId = "base:hammer_mastery";

        [SerializeField, Min(0)] private int baseRepairAmount = 1;
        [SerializeField] private SkillDefinition repairSkill;

        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation)
        {
            if (snapshot.CurrentInteractable is IRepairable repairable)
            {
                var skill = repairSkill != null
                    ? repairSkill
                    : _skillDefinitions.Get(DefaultRepairSkillId);
                var skillLevel = Character.Skills.GetLevel(skill);
                var bonus = skill.GetValueAtLevel(skillLevel);
                var repairAmount = Mathf.Max(0, Mathf.RoundToInt(baseRepairAmount + bonus));
                repairable.Repair(repairAmount);
            }
            return Completed();
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}
