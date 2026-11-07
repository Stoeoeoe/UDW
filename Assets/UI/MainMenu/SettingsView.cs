using MoreMountains.Tools;
using UnityEngine.UIElements;

namespace UI.MainMenu
{
    /// <summary>
    /// The menu's settings screen. Volumes are the sound manager's own, which it restores on startup;
    /// they are written to its settings file when the player leaves the screen.
    /// </summary>
    public sealed class SettingsView
    {
        private readonly MMSoundManager _sound = MMSoundManager.Current;

        public SettingsView(VisualElement view)
        {
            Bind(view.Q<Slider>("masterVolume"), MMSoundManager.MMSoundManagerTracks.Master);
            Bind(view.Q<Slider>("musicVolume"), MMSoundManager.MMSoundManagerTracks.Music);
            Bind(view.Q<Slider>("sfxVolume"), MMSoundManager.MMSoundManagerTracks.Sfx);
        }

        public void Save() => _sound.SaveSettings();

        private void Bind(Slider slider, MMSoundManager.MMSoundManagerTracks track)
        {
            slider.SetValueWithoutNotify(_sound.settingsSo.GetTrackVolume(track));
            slider.RegisterValueChangedCallback(change => _sound.SetTrackVolume(track, change.newValue));
        }
    }
}
