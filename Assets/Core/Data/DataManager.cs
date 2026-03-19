using MoreMountains.Tools;
using Sirenix.OdinInspector;
using System.Collections.Generic;
using System.Linq;
using Interaction.Dialog;
using UnityEngine;

public class DataManager : MMSingleton<DataManager>
{
    // public List<CharacterData> characters;
    // public List<CharacterExpression> expressions;
    public List<TypewriterSound> typewriterSounds;

    [FolderPath]
    public string CharacterDataPath = "CharacterData";
    [FolderPath]
    public string CharacterExpressionDataPath = "CharacterExpressions";
    [FolderPath]
    public string TypewriterSoundDataPath = "TypewriterSound";

    // public Dictionary<string, CharacterData> CharactersDict => characters.ToDictionary(c => c.ActorId, c=>c);
    // public Dictionary<string, CharacterExpression> ExpressionsDict => expressions.ToDictionary(c => c.name, c=>c);
    public Dictionary<string, TypewriterSound> TypewriterSounds => typewriterSounds.ToDictionary(c => c.name, c=>c);


    private void Start()
    {
        // this.characters = Resources.LoadAll<CharacterData>(CharacterDataPath).ToList();
        // this.expressions = Resources.LoadAll<CharacterExpression>(CharacterExpressionDataPath).ToList();
        this.typewriterSounds = Resources.LoadAll<TypewriterSound>(TypewriterSoundDataPath).ToList();
    }

}