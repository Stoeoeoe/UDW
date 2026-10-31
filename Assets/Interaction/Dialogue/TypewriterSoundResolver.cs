using Core.Dialogue.Vulcanus;

namespace Interaction.Dialog
{
    public static class TypewriterSoundResolver
    {
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

        public static TypewriterSound ResolveTypewriterSound(string speakerId, TypewriterSound defaultSound)
        {
            var catalog = DataManager.Instance.TypewriterSounds;
            var sound = catalog ? catalog.Get(speakerId) : null;
            return sound ? sound : defaultSound;
        }
    }
}
