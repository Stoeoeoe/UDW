using Character;
using Core;
using UnityEngine;

public class CharacterManager : PersistentSingleton<CharacterManager>
{
    public MainCharacter MainCharacter { get; private set; }

    public void RegisterMainCharacter(MainCharacter character)
    {
        MainCharacter = character;
        MainCharacterChangedEvent.Trigger(character);
    }
}
