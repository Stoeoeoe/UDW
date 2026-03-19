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

    private Dictionary<string, TypewriterSound> _typewriterSoundsDict;
    public IReadOnlyDictionary<string, TypewriterSound> TypewriterSounds => _typewriterSoundsDict;

    private void Start()
    {
        typewriterSounds = Resources.LoadAll<TypewriterSound>(TypewriterSoundDataPath).ToList();
        _typewriterSoundsDict = typewriterSounds.ToDictionary(c => c.name, c => c);
    }

}