using Character;
using Core;

/// <summary>The session's registered player. Consumers inject this instead of searching the scene.</summary>
public sealed class CharacterManager
{
    public MainCharacter MainCharacter { get; private set; }

    public void RegisterMainCharacter(MainCharacter character)
    {
        MainCharacter = character;
        MainCharacterChangedEvent.Trigger(character);
    }

    /// <summary>Clears the registration when the player is destroyed; a replacement registered meanwhile is kept.</summary>
    public void UnregisterMainCharacter(MainCharacter character)
    {
        if (!ReferenceEquals(MainCharacter, character)) return;
        RegisterMainCharacter(null);
    }
}
