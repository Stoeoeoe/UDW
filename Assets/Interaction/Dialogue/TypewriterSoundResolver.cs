using System;
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

            if (!string.IsNullOrWhiteSpace(speakerId))
            {
                if (DataManager.Current.TypewriterSounds != null &&
                    DataManager.Current.TypewriterSounds.TryGetValue(speakerId, out var mappedByName) &&
                    mappedByName != null)
                    return mappedByName;

                if (DataManager.Current.typewriterSounds != null)
                {
                    for (var i = 0; i < DataManager.Current.typewriterSounds.Count; i++)
                    {
                        var candidate = DataManager.Current.typewriterSounds[i];
                        if (candidate != null &&
                            string.Equals(candidate.ActorId, speakerId, StringComparison.OrdinalIgnoreCase))
                            return candidate;
                    }
                }
            }

            return defaultSound;
        }
    }
}