using Core.Catalogs;
using System;
using Character;
using Core.Common;
using Core.Game;

namespace Core.SocialStanding
{
    /// <summary>
    /// How much a subject (a character, a village, anything with a namespaced ID) thinks of the player, from
    /// <see cref="Min"/> to <see cref="Max"/>. A subject that has never changed stands at its starting value: a character's
    /// <see cref="CharacterDefinition.StartingSocialStanding"/>, otherwise <see cref="DefaultStanding"/>. Standings are saved
    /// in <see cref="GameState.SocialStanding"/>, read from there on every call so loading a save is picked up.
    /// </summary>
    public sealed class SocialStandingService
    {
        public const int Min = 0;
        public const int Max = 100;
        public const int DefaultStanding = 50;

        private readonly GameState _state;
        private readonly DefinitionCatalog _characters;

        public SocialStandingService(GameState state, DefinitionCatalog characters)
        {
            _state = state;
            _characters = characters;
        }

        public int Get(string subjectId)
        {
            RequireSubject(subjectId);
            return Current(subjectId);
        }

        public bool HasMoreThan(string subjectId, double standing) => Get(subjectId) > standing;

        public bool HasLessThan(string subjectId, double standing) => Get(subjectId) < standing;

        /// <summary>Raises the standing by a non-negative amount, up to <see cref="Max"/>. Returns the new standing.</summary>
        public int Increase(string subjectId, int amount) => Change(subjectId, amount, 1);

        /// <summary>Lowers the standing by a non-negative amount, down to <see cref="Min"/>. Returns the new standing.</summary>
        public int Decrease(string subjectId, int amount) => Change(subjectId, amount, -1);

        private int Change(string subjectId, int amount, int direction)
        {
            RequireSubject(subjectId);
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount), "Increase or decrease by a non-negative amount.");
            var previous = Current(subjectId);
            var current = (int)Math.Clamp((long)previous + (long)direction * amount, Min, Max);
            if (current == previous) return current;
            _state.SocialStanding.Set(subjectId, current);
            SocialStandingChangedEvent.Trigger(subjectId, previous, current);
            return current;
        }

        private int Current(string subjectId) => _state.SocialStanding.TryGet(subjectId, out var standing)
            ? standing
            : _characters.Get<CharacterDefinition>(subjectId)?.StartingSocialStanding ?? DefaultStanding;

        private static void RequireSubject(string subjectId)
        {
            if (!DefinitionIdRules.IsLowercaseNamespaced(subjectId))
                throw new ArgumentException($"'{subjectId}' is not a lowercase namespace:name subject ID.", nameof(subjectId));
        }
    }
}
