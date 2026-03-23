using Core.Events;

namespace Character
{
    public struct MainCharacterChangedEvent
    {
        public MainCharacter MainCharacter;

        public static void Trigger(MainCharacter mainCharacter)
            => EventBus<MainCharacterChangedEvent>.Raise(new MainCharacterChangedEvent { MainCharacter = mainCharacter });
    }
}