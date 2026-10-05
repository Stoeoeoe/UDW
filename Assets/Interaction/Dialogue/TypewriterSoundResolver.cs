using Core.Dialogue.Vulcanus;
using PixelCrushers.DialogueSystem;
using DialogueActor = PixelCrushers.DialogueSystem.Wrappers.DialogueActor;

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

            if (DialogueManager.currentConversant != null)
            {
                var actor = DialogueActor.GetDialogueActorComponent(DialogueManager.currentConversant);
                if (actor != null)
                {
                    var actorName = actor.GetActorName();
                    if (!string.IsNullOrWhiteSpace(actorName))
                        return actorName;
                }
            }

            if (DialogueManager.Instance != null &&
                DialogueManager.Instance.activeConversation != null &&
                DialogueManager.Instance.activeConversation.conversationModel != null &&
                DialogueManager.Instance.activeConversation.conversationModel.ActorInfo != null)
            {
                return DialogueManager.Instance.activeConversation.conversationModel.ActorInfo.nameInDatabase;
            }

            return null;
        }

        public static TypewriterSound ResolveTypewriterSound(string speakerId, TypewriterSound defaultSound)
        {
            if (DataManager.Current == null)
                return defaultSound;

            var catalog = DataManager.Current.TypewriterSounds;
            var sound = catalog ? catalog.Get(speakerId) : null;
            return sound ? sound : defaultSound;
        }
    }
}
