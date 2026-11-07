using MoreMountains.Tools;
using UnityEngine.UIElements;

namespace UI.Shared
{
    /// <summary>
    /// The settings controls shared by the main menu and the game menu (<c>SettingsPage.uxml</c>). Volumes are the sound
    /// manager's own, which it restores on startup; they are written to its settings file by <see cref="Save"/>.
    /// </summary>
    public sealed class SettingsPage
    {
        private static readonly (string Name, MMSoundManager.MMSoundManagerTracks Track)[] Volumes =
        {
            ("masterVolume", MMSoundManager.MMSoundManagerTracks.Master),
            ("musicVolume", MMSoundManager.MMSoundManagerTracks.Music),
            ("sfxVolume", MMSoundManager.MMSoundManagerTracks.Sfx),
        };

        private readonly VisualElement _page;

        public SettingsPage(VisualElement page)
        {
            _page = page;
            foreach (var (name, track) in Volumes)
                page.Q<Slider>(name).RegisterValueChangedCallback(change =>
                    MMSoundManager.Current.SetTrackVolume(track, change.newValue));
        }

        /// <summary>Shows the current volumes. Call whenever the page is shown.</summary>
        public void Show()
        {
            foreach (var (name, track) in Volumes)
                _page.Q<Slider>(name).SetValueWithoutNotify(MMSoundManager.Current.settingsSo.GetTrackVolume(track));
        }

        public void Save() => MMSoundManager.Current.SaveSettings();
    }
}
