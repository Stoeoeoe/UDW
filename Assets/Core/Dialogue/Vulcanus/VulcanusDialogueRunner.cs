using System;
using System.Collections.Generic;
using System.Threading;
using Core.Scripting;
using UnityEngine;
using Character;
using UI.Shared;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>
    /// Walks an authored dialogue graph and hands each line and choice to the presenter. It is a plain session service:
    /// the presenter, catalog and Lua runtime are injected, and the flow is an awaitable that stopping cancels.
    /// </summary>
    public sealed class VulcanusDialogueRunner : IDisposable
    {
        private const int MaxStepsPerRun = 256;

        private readonly DialogueCatalog _catalog;
        private readonly IDialoguePresenter _presenter;
        private readonly VulcanusLuaDialogueScriptEngine _scriptEngine;
        private CancellationTokenSource _cancellation;
        private VulcanusDialogueExecutionContext _activeContext;
        private Action _onCompleted;

        public VulcanusDialogueRunner(DialogueCatalog catalog, IDialoguePresenter presenter, LuaRuntime lua)
        {
            _catalog = catalog;
            _presenter = presenter;
            _scriptEngine = new VulcanusLuaDialogueScriptEngine(lua.CreateEngine());
            _presenter.Dismissed += StopDialogue;
        }

        public VulcanusDialogueExecutionContext ActiveContext => _activeContext;
        public string CurrentDialogueId => _activeContext?.CurrentDialogue?.DialogueId;

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
            Action onCompleted = null)
        {
            var (dialogue, startNode) = ResolveDialogue(dialogueId);
            if (IsDialogueActive)
                throw new InvalidOperationException("Finish the current dialogue before starting another.");

            _onCompleted = onCompleted;
            Run(dialogue, startNode, instigator, pauseWhileOpen);
            return true;
        }

        /// <summary>Checks a script's dialogue reference before playback opens the UI.</summary>
        public void ValidateDialogue(string dialogueId) => ResolveDialogue(dialogueId);

        /// <summary>Check referenced dialogue assets before cutscene playback. Dialogue actions apply immediately.</summary>
        public void ValidateCutsceneDialogue(string dialogueId)
        {
            var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void Visit(string id)
            {
                if (!visited.Add(id)) return; // Dialogue jumps may form a cycle; validate each asset once.
                var (dialogue, _) = ResolveDialogue(id);
                if (dialogue.ImportDiagnostics.Length > 0)
                    throw new InvalidOperationException($"Cutscene dialogue '{id}' has import errors: {string.Join("; ", dialogue.ImportDiagnostics)}");
                foreach (var node in dialogue.Nodes)
                {
                    if (node is VulcanusDialogueJumpNode jump && !string.IsNullOrWhiteSpace(jump.TargetDialogueId))
                        Visit(jump.TargetDialogueId);
                }
            }
            Visit(dialogueId);
        }

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
            ScreenPauseMode? pauseWhileOpen)
        {
            try { await RunDialogue(dialogue, startNode, instigator, pauseWhileOpen); }
            catch (OperationCanceledException) { }
            catch (Exception error) { Debug.LogException(error); }
        }

        private async Awaitable RunDialogue(VulcanusDialogueAsset startingDialogue, VulcanusDialogueNode currentNode,
            GameCharacter instigator, ScreenPauseMode? pauseWhileOpen)
        {
            using var cancellation = new CancellationTokenSource();
            var token = cancellation.Token;
            _cancellation = cancellation;
            var context = _activeContext = new VulcanusDialogueExecutionContext
            {
                Project = startingDialogue.Project,
                CurrentDialogue = startingDialogue,
                StepsExecuted = 0,
                Instigator = instigator,
                PauseWhileOpen = pauseWhileOpen
            };

            var completed = false;
            try
            {
                _presenter.OnDialogueStarted(context);
                while (currentNode != null)
                {
                    context.CurrentNode = currentNode;
                    context.StepsExecuted++;
                    if (context.StepsExecuted > MaxStepsPerRun)
                    {
                        Debug.LogError($"Dialogue '{context.CurrentDialogue.DialogueId}' exceeded {MaxStepsPerRun} steps.");
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
                            if (!TryResolveLocalNode(context.CurrentDialogue, line.Next, out currentNode)) return;
                            break;

                        case VulcanusDialogueChoiceNode choice:
                            if (!TryBuildVisibleOptions(choice, context, out var options)) return;
                            if (options.Count == 0)
                            {
                                Debug.LogError($"Choice '{choice.Id}' has zero visible options.");
                                return;
                            }
                            var selected = await _presenter.PresentChoice(choice, options, context, token);
                            if (selected == null)
                            {
                                Debug.LogError($"No option was selected for choice '{choice.Id}'.");
                                return;
                            }
                            if (!TryResolveLocalNode(context.CurrentDialogue, selected.TargetNodeId, out currentNode)) return;
                            break;

                        case VulcanusDialogueActionNode action:
                            if (!RunAction(action, context)) return;
                            if (!TryResolveLocalNode(context.CurrentDialogue, action.Next, out currentNode)) return;
                            break;

                        case VulcanusDialogueJumpNode jump:
                            if (!RunJump(jump, context, out currentNode)) return;
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

        private bool RunJump(VulcanusDialogueJumpNode jump, VulcanusDialogueExecutionContext context,
            out VulcanusDialogueNode nextNode)
        {
            nextNode = null;
            if (string.IsNullOrWhiteSpace(jump.TargetNodeId))
            {
                Debug.LogError($"Jump '{jump.Id}' has an empty target node ID.");
                return false;
            }
            if (string.IsNullOrWhiteSpace(jump.TargetDialogueId))
                return TryResolveLocalNode(context.CurrentDialogue, jump.TargetNodeId, out nextNode);

            var targetDialogue = _catalog.Get(jump.TargetDialogueId);
            if (!targetDialogue)
            {
                Debug.LogError($"Jump '{jump.Id}' references unknown dialogue '{jump.TargetDialogueId}'.");
                return false;
            }
            if (!TryResolveLocalNode(targetDialogue, jump.TargetNodeId, out nextNode)) return false;
            context.CurrentDialogue = targetDialogue;
            context.Project = targetDialogue.Project != null ? targetDialogue.Project : context.Project;
            return true;
        }

        private bool TryBuildVisibleOptions(VulcanusDialogueChoiceNode choice, VulcanusDialogueExecutionContext context,
            out List<VulcanusDialogueChoiceOption> visibleOptions)
        {
            visibleOptions = new List<VulcanusDialogueChoiceOption>();
            foreach (var option in choice.Options)
            {
                if (option == null || string.IsNullOrWhiteSpace(option.TargetNodeId))
                {
                    Debug.LogError($"Choice '{choice.Id}' has an invalid option.");
                    return false;
                }
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

        private static bool TryResolveLocalNode(VulcanusDialogueAsset dialogue, string nodeId, out VulcanusDialogueNode node)
        {
            node = null;
            // An empty Next means the flow ends here.
            if (string.IsNullOrWhiteSpace(nodeId)) return true;
            if (dialogue.TryGetNode(nodeId, out node)) return true;
            Debug.LogError($"Dialogue '{dialogue.DialogueId}' references missing node '{nodeId}'.");
            return false;
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
            _presenter.OnDialogueFinished(context);
        }
    }
}
