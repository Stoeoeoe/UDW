using System.Collections.Generic;
using Core.Common;

namespace Core.Quests
{
    /// <summary>A quest's rules are annotations on <see cref="QuestDefinition"/> and the types it contains.</summary>
    public sealed class QuestValidator : ScriptableObjectValidator<QuestDefinition>
    {
        protected override void CollectConfigurationErrors(QuestDefinition asset, List<ConfigurationError> errors) { }
    }
}
