using System;
using System.Collections.Generic;
using Core.Common;
using UnityEngine;

namespace Core.Divinity
{
    [CreateAssetMenu(fileName = "Deity", menuName = "Game/Divine Favour/Deity")]
    public sealed class DeityDefinition : ValidatedScriptableObject<DeityDefinitionValidator>
    {
        [Tooltip("Stable save ID, independent of the display name.")]
        [NamespacedId, SerializeField, Validation.Id("Assign a stable, nonblank deity ID.")]
        private string _id;

        [Tooltip("C# member generated for this deity, for example Mars. Leave empty to derive it from the ID.")]
        [SerializeField]
        private string _codeName;

        [SerializeField]
        private string _displayName;

        [SerializeField, TextArea(2, 4)]
        private string _description;

        [SerializeField]
        private Sprite _icon;

        [Tooltip("Points lost toward neutral (zero) each day. Zero disables decay.")]
        [SerializeField, Validation.Min(0, "Must be nonnegative; zero disables decay.")]
        private int _dailyDecay;

        [SerializeField, Validation.Required("Must not be null; an empty array grants no boons."), Validation.RequiredElements("Level must not be null."), Validation.Nested]
        private FavourLevel[] levels = Array.Empty<FavourLevel>();

        public string Id => _id;
        public string CodeName => _codeName;
        public string DisplayName => _displayName;
        public string Description => _description;
        public Sprite Icon => _icon;
        public int DailyDecay => _dailyDecay;
        public IReadOnlyList<FavourLevel> Levels => levels;

    }

    [Serializable]
    public sealed class FavourLevel
    {
        [SerializeField, Validation.Min(1)]
        private int requiredPoints = 1;
        [SerializeField]
        private string title;
        [SerializeField, Validation.Required("Must not be null; an empty array grants no boons."), Validation.ValidReference]
        private BoonDefinition[] boons = Array.Empty<BoonDefinition>();

        public int RequiredPoints => requiredPoints;
        public string Title => title;
        public IReadOnlyList<BoonDefinition> Boons => boons;

    }
}
