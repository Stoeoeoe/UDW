using Character;
using Core;

public sealed class CharacterManager
{
    public MainCharacter MainCharacter { get; private set; }

    public void RegisterMainCharacter(MainCharacter character)
    {
        MainCharacter = character;
        MainCharacterChangedEvent.Trigger(character);
    }
}
