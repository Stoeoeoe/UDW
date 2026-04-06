using System.Collections;
using Core.Context;

namespace Interaction.Tools.Hammer
{
    public class HammerAction : ToolAction
    {
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot)
        {
            // TODO: Repair object in front
            yield break;
        }

        public override void Interrupt(PlayerInteractionContextSnapshot snapshot)
        {
            
        }
    }
}