using Core.Dialogue.Vulcanus;

namespace Interaction.Dialog
{
    public sealed class TypewriterSoundResolver
    {
        private readonly TypewriterSoundCatalog _catalog;
        public TypewriterSoundResolver(TypewriterSoundCatalog catalog) => _catalog = catalog;
        public static string ResolveCurrentSpeakerId()
        {
            if (VulcanusDialogueRunner.Instance != null && VulcanusDialogueRunner.Instance.IsDialogueActive)
            {
                var vulcanusSpeaker = VulcanusDialogueRunner.Instance.CurrentSpeakerId;
                if (!string.IsNullOrWhiteSpace(vulcanusSpeaker))
                    return vulcanusSpeaker;
            }

            return null;
        }

        public TypewriterSound ResolveTypewriterSound(string speakerId, TypewriterSound defaultSound)
        {
            var sound = _catalog.Get(speakerId);
            return sound ? sound : defaultSound;
        }
    }
}
