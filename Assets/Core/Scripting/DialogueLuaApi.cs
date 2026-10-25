using System;
using Character;
using Core.Dialogue.Vulcanus;

namespace Core.Scripting
{
    /// <summary>Lets a cutscene wait while the existing dialogue UI runs its flow.</summary>
    [LuaModule("Dialogue")]
    public sealed class DialogueLuaApi
    {
        private readonly VulcanusDialogueRunner _runner;
        private readonly GameCharacter _player;

        public DialogueLuaApi(VulcanusDialogueRunner runner, GameCharacter player)
        {
            if (!runner || !runner.isActiveAndEnabled)
                throw new InvalidOperationException("Dialogue actions require an active dialogue runner.");
            if (!player || !player.IsRuntimeInitialized)
                throw new InvalidOperationException("Dialogue actions require the initialized player.");
            _runner = runner;
            _player = player;
        }

        [UnityEngine.Scripting.Preserve]
        public void ValidatePlay(string dialogue) => _runner.ValidateCutsceneDialogue(dialogue);

        [LuaAction("dialogue.play", "Play dialogue", "Dialogue", "Wait for a conversation to finish through its flow.", "cutscene", Validator = nameof(ValidatePlay))]
        [LuaPreview(LuaPreviewSpatialState.Unknown)]
        [LuaPreviewEffect(0, LuaPreviewEffectKind.ShowDialogue, DialogueParameter = "dialogue")]
        public ILuaAction Play([LuaReference("dialogueRef", "dialogue")] string dialogue) =>
            new PlayDialogueAction(_runner, _player, dialogue);

        private sealed class PlayDialogueAction : ILuaAction
        {
            private readonly VulcanusDialogueRunner _runner;
            private bool _completed;

            public PlayDialogueAction(VulcanusDialogueRunner runner, GameCharacter player, string dialogue)
            {
                _runner = runner;
                runner.StartDialogue(dialogue, player, onCompleted: () => _completed = true);
            }

            public bool IsCompleted => _completed;

            public void Tick(float deltaTime)
            {
                if (!_completed && (!_runner || !_runner.IsDialogueActive))
                    throw new InvalidOperationException("Dialogue stopped before reaching the end of its flow. See dialogue diagnostics.");
            }

            public void Dispose()
            {
                // Stopping the surrounding Lua session must also close its dialogue UI.
                if (!_completed && _runner) _runner.StopDialogue();
            }
        }
    }
}
