using System;
using System.Collections.Generic;
using Core.Common;
using Sirenix.Serialization;

namespace Core.SocialStanding
{
    /// <summary>
    /// Saved standings, by subject: a character, a village or anything else with a namespaced ID. Only a standing that has
    /// changed is saved; the rest still stand at their starting value (<see cref="SocialStandingService"/>).
    /// </summary>
    [Serializable]
    public sealed class SocialStandingState
    {
        [OdinSerialize] private Dictionary<string, int> _standings = new(StringComparer.Ordinal);

        internal bool TryGet(string subjectId, out int standing) => _standings.TryGetValue(subjectId, out standing);

        internal void Set(string subjectId, int standing) => _standings[subjectId] = standing;

        internal void Validate()
        {
            if (_standings == null) throw new FormatException("The save is missing social standing state.");
            foreach (var pair in _standings)
                if (!DefinitionIdRules.IsLowercaseNamespaced(pair.Key) ||
                    pair.Value < SocialStandingService.Min || pair.Value > SocialStandingService.Max)
                    throw new FormatException($"The save contains an invalid social standing for '{pair.Key}'.");
        }
    }
}
