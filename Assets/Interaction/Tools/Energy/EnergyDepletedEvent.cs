using MoreMountains.Tools;

namespace Interaction.Tools.Energy
{
    public struct EnergyDepletedEvent
    {
        static EnergyDepletedEvent e;

        public static void Trigger()
        {
            MMEventManager.TriggerEvent(e);
        }
    }
}