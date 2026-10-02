using System;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Divinity
{
    [CreateAssetMenu(fileName = "Deity", menuName = "Game/Divine Favour/Deity")]
    public sealed class DeityDefinition : ScriptableObject
    {
        [Tooltip("Stable save ID, independent of the display name.")]
        [SerializeField] private string id;
        [Tooltip("C# member generated for this deity, for example Mars. Leave empty to derive it from the ID.")]
        [SerializeField] private string codeName;
        [SerializeField] private string displayName;
        [TextArea(2, 4)] [SerializeField] private string description;
        [SerializeField] private Sprite icon;
        [Tooltip("Points lost toward neutral (zero) each day. Zero disables decay.")]
        [Min(0)] [SerializeField] private int dailyDecay;
        [SerializeField] private FavourLevel[] levels = Array.Empty<FavourLevel>();

        public string Id => id;
        public string CodeName => codeName;
        public string DisplayName => displayName;
        public string Description => description;
        public Sprite Icon => icon;
        public int DailyDecay => dailyDecay;
        public IReadOnlyList<FavourLevel> Levels => levels;
    }

    [Serializable]
    public sealed class FavourLevel
    {
        [Min(1)] [SerializeField] private int requiredPoints = 1;
        [SerializeField] private string title;
        [SerializeField] private BoonDefinition[] boons = Array.Empty<BoonDefinition>();

        public int RequiredPoints => requiredPoints;
        public string Title => title;
        public IReadOnlyList<BoonDefinition> Boons => boons;
    }
}
