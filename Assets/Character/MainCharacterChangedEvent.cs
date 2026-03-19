using MoreMountains.Tools;

namespace Character
{
    public struct MainCharacterChangedEvent
    {
        public MainCharacter MainCharacter;
        private static MainCharacterChangedEvent e;
        
        public static void Trigger(MainCharacter mainCharacter)
        {
            e.MainCharacter = mainCharacter;
            MMEventManager.TriggerEvent(e);
        }
    }
}