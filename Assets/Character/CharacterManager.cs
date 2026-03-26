using Character;
using Core;

public class CharacterManager : Singleton<CharacterManager>
{
    public MainCharacter MainCharacter { get; private set; }

    public void RegisterMainCharacter(MainCharacter character)
    {
        MainCharacter = character;
        MainCharacterChangedEvent.Trigger(character);
    }
}
