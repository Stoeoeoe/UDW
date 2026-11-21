using System.Linq;
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.UIElements;

namespace Core.Music.Editor
{
    [CustomEditor(typeof(MusicCue))]
    public sealed class MusicCueEditor : UnityEditor.Editor
    {
        private GameObject _previewRoot;
        private MusicPlaybackEngine _preview;
        private readonly MusicRequestResolver _requests = new();
        private MusicRequestResolver.Handle _request;
        private double _lastDsp;
        public override VisualElement CreateInspectorGUI()
        {
            var root = new VisualElement();
            InspectorElement.FillDefaultInspector(root, serializedObject, this);
            var errors = new HelpBox("", HelpBoxMessageType.Error);
            root.Add(errors);
            var cue = (MusicCue)target;
            var preset = new TextField("Preview preset") { value = cue.presets.FirstOrDefault()?.id ?? "" };
            root.Add(preset);
            preset.RegisterValueChangedCallback(change =>
            {
                if (_request != null) _request.Update(cue, change.newValue, MusicQuantization.Immediate, 0.5);
            });
            var previewButton = new Button(() =>
            {
                Stop(); cue.RequireValidConfiguration();
                var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(
                    "Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSoundManager/Settings/MMSoundManagerAudioMixer.mixer");
                _previewRoot = new GameObject("Music Inspector Preview") { hideFlags = HideFlags.HideAndDontSave };
                _preview = new MusicPlaybackEngine(_previewRoot.transform, mixer.FindMatchingGroups("Music").Single());
                _request = _requests.Request(cue, preset.value, quantization: MusicQuantization.Immediate, fadeSeconds: 0.1);
                _lastDsp = AudioSettings.dspTime;
                EditorApplication.update += Tick;
            }) { text = "Preview synchronized stems" };
            previewButton.SetEnabled(!EditorApplication.isPlayingOrWillChangePlaymode);
            root.Add(previewButton);
            root.Add(new Button(Stop) { text = "Stop preview" });
            var status = new Label(); root.Add(status);
            root.schedule.Execute(() =>
            {
                previewButton.SetEnabled(!EditorApplication.isPlayingOrWillChangePlaymode);
                errors.text = string.Join("\n", cue.ValidateConfiguration());
                errors.style.display = string.IsNullOrEmpty(errors.text) ? DisplayStyle.None : DisplayStyle.Flex;
                status.text = _preview == null ? "Preview stopped" : $"Beat {_preview.Beat(AudioSettings.dspTime):F2} | Groups {_preview.GroupCount}";
            }).Every(250);
            return root;
        }
        private void Tick()
        {
            // Audio device changes can reset the editor DSP clock too.
            if (AudioSettings.dspTime < _lastDsp) { Stop(); return; }
            _lastDsp = AudioSettings.dspTime;
            _preview.Tick(_lastDsp, 0.2, _requests.Winner);
        }
        private void Stop()
        {
            EditorApplication.update -= Tick;
            _request?.Dispose(); _request = null;
            _preview?.Dispose(); _preview = null;
            if (_previewRoot) DestroyImmediate(_previewRoot);
        }
        private void OnEnable()
        {
            AssemblyReloadEvents.beforeAssemblyReload += Stop;
            EditorApplication.playModeStateChanged += PlayModeChanged;
        }
        private void PlayModeChanged(PlayModeStateChange state) => Stop();
        private void OnDisable()
        {
            Stop(); AssemblyReloadEvents.beforeAssemblyReload -= Stop;
            EditorApplication.playModeStateChanged -= PlayModeChanged;
        }
    }

    [CustomEditor(typeof(MusicDirector))]
    public sealed class MusicDirectorEditor : UnityEditor.Editor
    {
        public override VisualElement CreateInspectorGUI()
        {
            var root = new VisualElement();
            var status = new Label(); root.Add(status);
            root.schedule.Execute(() =>
            {
                var director = (MusicDirector)target;
                var winner = director.Requests.Winner;
                status.text = $"Requests: {director.Requests.Count}\nWinner: {winner?.Cue.Id} / {winner?.Preset} (priority {winner?.Priority})\n" +
                    $"Current: {director.CurrentCue}\nIncoming: {director.IncomingCue}\nGroups: {director.GroupCount}\nBeat: {director.Beat:F2}\nScheduled DSP: {director.TransitionDspTime:F3}";
            }).Every(100);
            return root;
        }
    }
}
