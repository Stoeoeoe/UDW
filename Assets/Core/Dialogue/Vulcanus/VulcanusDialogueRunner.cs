using System;
using System.Collections.Generic;
using System.Threading;
using Character;
using Core.Scripting;
using Core.TimeAndWeather;
using UI.Shared;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>
    /// Walks an authored dialogue graph and hands each line and choice to the presenter. It is a plain session service:
    /// the presenter, catalog and Lua runtime are injected, and the flow is an awaitable that stopping cancels. Game time
    /// stands still while a dialogue runs, however it was started.
    /// </summary>
    public sealed class VulcanusDialogueRunner : IDisposable
    {
        private const int MaxStepsWithoutInput = 256;

        private readonly DialogueCatalog _catalog;
        private readonly IDialoguePresenter _presenter;
        private readonly VulcanusLuaDialogueScriptEngine _scriptEngine;
        private readonly GameClock _clock;
        private CancellationTokenSource _cancellation;
        private VulcanusDialogueExecutionContext _activeContext;
        private Action _onCompleted;

        public VulcanusDialogueRunner(DialogueCatalog catalog, IDialoguePresenter presenter, LuaRuntime lua, GameClock clock)
        {
            _catalog = catalog;
            _clock = clock;
            _presenter = presenter;
            _scriptEngine = new VulcanusLuaDialogueScriptEngine(lua.CreateEngine());
            _presenter.Dismissed += StopDialogue;
        }

        public VulcanusDialogueExecutionContext ActiveContext => _activeContext;
        public string CurrentDialogueId => _activeContext?.CurrentDialogue?.Id;

        public string CurrentSpeakerId =>
            _activeContext?.CurrentNode is VulcanusDialogueLineNode lineNode ? lineNode.Speaker : null;

        public bool IsDialogueActive => _activeContext != null;

        public void Dispose()
        {
            _presenter.Dismissed -= StopDialogue;
            StopDialogue();
        }

        /// <summary>Calls onCompleted after the dialogue reaches the end of its flow.</summary>
        public bool StartDialogue(string dialogueId, GameCharacter instigator = null, ScreenPauseMode? pauseWhileOpen = null,
            Action onCompleted = null, string debugSource = null)
        {
            var (dialogue, startNode) = ResolveDialogue(dialogueId);
            if (IsDialogueActive)
                throw new InvalidOperationException("Finish the current dialogue before starting another.");

            _onCompleted = onCompleted;
            Run(dialogue, startNode, instigator, pauseWhileOpen, debugSource);
            return true;
        }

        /// <summary>Checks a script's dialogue reference before playback opens the UI.</summary>
        public void ValidateDialogue(string dialogueId) => ResolveDialogue(dialogueId);

        private (VulcanusDialogueAsset Dialogue, VulcanusDialogueNode StartNode) ResolveDialogue(string dialogueId)
        {
            var dialogue = _catalog.Get(dialogueId)
                ?? throw new InvalidOperationException($"Dialogue '{dialogueId}' was not found in the dialogue catalog.");
            if (!dialogue.TryGetNode(dialogue.StartNodeId, out var startNode))
                throw new InvalidOperationException($"Dialogue '{dialogueId}' has no valid start node.");
            return (dialogue, startNode);
        }

        /// <summary>Cancels the running flow and closes the presenter. Safe to call when nothing is running.</summary>
        public void StopDialogue()
        {
            var context = _activeContext;
            if (context == null) return;
            // Cancelling may unwind the flow immediately; its cleanup closes the dialogue exactly once.
            _cancellation?.Cancel();
            CloseDialogue(context);
        }

        public bool TryAdvanceActiveDialogue() =>
            IsDialogueActive && _presenter is IDialogueAdvanceHandler handler && handler.TryAdvanceDialogue();

        // Entry point of the flow: presenters and Lua failures are logged, and cancellation is an expected way to end.
        private async void Run(VulcanusDialogueAsset dialogue, VulcanusDialogueNode startNode, GameCharacter instigator,
            ScreenPauseMode? pauseWhileOpen, string debugSource)
        {
            try { await RunDialogue(dialogue, startNode, instigator, pauseWhileOpen, debugSource); }
            catch (OperationCanceledException) { }
            catch (Exception error) { Debug.LogException(error); }
        }

        private async Awaitable RunDialogue(VulcanusDialogueAsset startingDialogue, VulcanusDialogueNode currentNode,
            GameCharacter instigator, ScreenPauseMode? pauseWhileOpen, string debugSource)
        {
            using var cancellation = new CancellationTokenSource();
            var token = cancellation.Token;
            _cancellation = cancellation;
            var context = _activeContext = new VulcanusDialogueExecutionContext
            {
                CurrentDialogue = startingDialogue,
                StepsExecuted = 0,
                Instigator = instigator,
                PauseWhileOpen = pauseWhileOpen,
                DebugSource = debugSource
            };
            _clock.Pause(context);

            var completed = false;
            var stepsWithoutInput = 0;
            try
            {
                _presenter.OnDialogueStarted(context);
                while (currentNode != null)
                {
                    context.CurrentNode = currentNode;
                    context.StepsExecuted++;
                    if (++stepsWithoutInput > MaxStepsWithoutInput)
                    {
                        Debug.LogError($"Dialogue '{context.CurrentDialogue.Id}' exceeded {MaxStepsWithoutInput} steps without player input.");
                        return;
                    }

                    if (!currentNode.IsExecutable)
                    {
                        context.CurrentDialogue.TryGetExecutableNodeAfter(currentNode.Id, out currentNode);
                        continue;
                    }

                    switch (currentNode)
                    {
                        case VulcanusDialogueLineNode line:
                            var text = context.CurrentDialogue.ResolveLocalizedText(line.MsgKey, line.Text);
                            await _presenter.PresentLine(line, text, context, token);
                            stepsWithoutInput = 0;
                            currentNode = ResolveLocalNode(context.CurrentDialogue, line.Next);
                            break;

                        case VulcanusDialogueChoiceNode choice:
                            if (!TryBuildVisibleOptions(choice, context, out var options)) return;
                            if (options.Count == 0)
                            {
                                Debug.LogError($"Choice '{choice.Id}' has zero visible options.");
                                return;
                            }
                            var selected = await _presenter.PresentChoice(choice, options, context, token);
                            stepsWithoutInput = 0;
                            if (selected == null)
                            {
                                Debug.LogError($"No option was selected for choice '{choice.Id}'.");
                                return;
                            }
                            currentNode = ResolveLocalNode(context.CurrentDialogue, selected.TargetNodeId);
                            break;

                        case VulcanusDialogueActionNode action:
                            if (!RunAction(action, context)) return;
                            currentNode = ResolveLocalNode(context.CurrentDialogue, action.Next);
                            break;

                        case VulcanusDialogueJumpNode jump:
                            currentNode = RunJump(jump, context);
                            break;

                        case VulcanusDialogueEndNode:
                            currentNode = null;
                            break;

                        default:
                            Debug.LogError($"Unsupported dialogue node type '{currentNode.GetType().Name}'.");
                            return;
                    }
                }
                completed = true;
            }
            finally
            {
                if (_cancellation == cancellation) _cancellation = null;
                // Only reaching the end of the flow calls the completion callback.
                if (completed) FinishDialogue(context);
                else CloseDialogue(context);
            }
        }

        private bool RunAction(VulcanusDialogueActionNode actionNode, VulcanusDialogueExecutionContext context)
        {
            if (string.IsNullOrWhiteSpace(actionNode.Lua))
                return true;

            if (_scriptEngine.ExecuteAction(actionNode.Lua, context))
                return true;

            Debug.LogError($"[VulcanusDialogueRunner] Action node '{actionNode.Id}' failed.");
            return false;
        }

        private VulcanusDialogueNode RunJump(VulcanusDialogueJumpNode jump, VulcanusDialogueExecutionContext context)
        {
            if (string.IsNullOrWhiteSpace(jump.TargetDialogueId))
                return ResolveLocalNode(context.CurrentDialogue, jump.TargetNodeId);

            var targetDialogue = _catalog.Get(jump.TargetDialogueId)
                ?? throw new InvalidOperationException($"Jump '{jump.Id}' references unknown dialogue '{jump.TargetDialogueId}'.");
            context.CurrentDialogue = targetDialogue;
            return ResolveLocalNode(targetDialogue, jump.TargetNodeId);
        }

        private bool TryBuildVisibleOptions(VulcanusDialogueChoiceNode choice, VulcanusDialogueExecutionContext context,
            out List<VulcanusDialogueChoiceOption> visibleOptions)
        {
            visibleOptions = new List<VulcanusDialogueChoiceOption>();
            foreach (var option in choice.Options)
            {
                if (string.IsNullOrWhiteSpace(option.Condition))
                {
                    visibleOptions.Add(option);
                    continue;
                }
                if (!_scriptEngine.EvaluateCondition(option.Condition, context, out var isVisible)) return false;
                if (isVisible) visibleOptions.Add(option);
            }
            return true;
        }

        private static VulcanusDialogueNode ResolveLocalNode(VulcanusDialogueAsset dialogue, string nodeId)
        {
            // An empty Next means the flow ends here.
            if (string.IsNullOrWhiteSpace(nodeId)) return null;
            if (dialogue.TryGetNode(nodeId, out var node)) return node;
            throw new InvalidOperationException($"Dialogue '{dialogue.Id}' references missing node '{nodeId}'.");
        }

        private void FinishDialogue(VulcanusDialogueExecutionContext context)
        {
            if (_activeContext != context) return; // The dialogue was stopped, and another may already be running.
            var completed = _onCompleted;
            CloseDialogue(context);
            completed?.Invoke();
        }

        // A stopped flow resumes later to run this cleanup, so it must not close a newer dialogue.
        private void CloseDialogue(VulcanusDialogueExecutionContext context)
        {
            if (_activeContext != context) return;
            _activeContext = null;
            _onCompleted = null;
            _clock.Resume(context);
            _presenter.OnDialogueFinished(context);
        }
    }
}
