using System;
using Unity.Pipeline.Commands;
using UnityEditor;
using VContainer;
using VContainer.Unity;

namespace Core.SocialStanding.Editor
{
    /// <summary>Dev-only Play mode command for trying dialogue and quest conditions that depend on social standing.</summary>
    public static class SocialStandingCommands
    {
        [CliCommand("set_social_standing", "Set the player's social standing with a character, village or other subject in the running game (0 to 100)", MainThreadRequired = true)]
        public static object SetSocialStanding(
            [CliArg("subject", "Subject ID such as base:fabia", Required = true)] string subject,
            [CliArg("standing", "The new standing, a whole number from 0 to 100", Required = true)] int standing)
        {
            if (!EditorApplication.isPlaying)
                throw new InvalidOperationException("Start the game in Play mode before using set_social_standing.");
            if (standing < SocialStandingService.Min || standing > SocialStandingService.Max)
                throw new ArgumentOutOfRangeException(nameof(standing), $"The standing must be from {SocialStandingService.Min} to {SocialStandingService.Max}.");

            var service = LifetimeScope.Find<SystemRoot>().Container.Resolve<SocialStandingService>();
            var previous = service.Get(subject);
            // The service only changes standing by an amount, which also raises the changed event.
            var current = standing >= previous ? service.Increase(subject, standing - previous) : service.Decrease(subject, previous - standing);
            return new { subject, previous, current };
        }
    }
}
