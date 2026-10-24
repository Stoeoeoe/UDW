using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Core.Scripting;
using UnityEngine;
using Character;
using UI.Shared;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusDialogueRunner : MonoBehaviour
    {
        public static VulcanusDialogueRunner Instance { get; private set; }

        [SerializeField] private VulcanusDialogueDatabase database;
        [SerializeField] private int maxStepsPerRun = 256;
        [SerializeField] private UnityEngine.Object contextResolver;
        [SerializeField] private UnityEngine.Object presenter;

        private Coroutine _activeDialogueRoutine;
        private VulcanusDialogueExecutionContext _activeContext;
        private Action _onCompleted;
        private readonly VulcanusLuaDialogueScriptEngine _scriptEngine = new(new VulcanusLuaEngine());

        private IDialogueContextResolver _contextResolver;
        private IDialoguePresenter _presenter;
        private IDialogueAdvanceHandler _advanceHandler;

        public VulcanusDialogueExecutionContext ActiveContext => _activeContext;
        public string CurrentDialogueId => _activeContext?.CurrentDialogue?.DialogueId;

        public string CurrentSpeakerId =>
            _activeContext?.CurrentNode is VulcanusDialogueLineNode lineNode ? lineNode.Speaker : null;

        public bool IsDialogueActive => _activeContext != null;

        private void Awake()
        {
            if (database == null) throw new InvalidOperationException("Dialogue runner requires its database.");
            if (maxStepsPerRun < 1) throw new InvalidOperationException("Dialogue maxStepsPerRun must be positive.");
            _presenter = ResolveInterface<IDialoguePresenter>(presenter)
                ?? throw new InvalidOperationException("Dialogue runner requires its presenter.");
            _contextResolver = ResolveInterface<IDialogueContextResolver>(contextResolver);
            _advanceHandler = _presenter as IDialogueAdvanceHandler;
            if (Instance != null && Instance != this)
                throw new InvalidOperationException("Only one dialogue runner may be active.");
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this)
                Instance = null;
        }

        private void OnDisable() => StopDialogue();

        /// <summary>Calls onCompleted after the dialogue reaches the end of its flow.</summary>
        public bool StartDialogue(string dialogueId, GameCharacter instigator = null, ScreenPauseMode? pauseWhileOpen = null,
            Action onCompleted = null)
        {
            var (dialogue, startNode) = ResolveDialogue(dialogueId);
            if (IsDialogueActive)
                throw new InvalidOperationException("Finish the current dialogue before starting another.");

            _onCompleted = onCompleted;
            var routine = StartCoroutine(RunDialogue(dialogue, startNode, instigator, pauseWhileOpen));
            // A dialogue with only an End node can finish before StartCoroutine returns.
            _activeDialogueRoutine = IsDialogueActive ? routine : null;
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
            if (!database.TryGetDialogue(dialogueId, out var dialogue))
                throw new InvalidOperationException($"Dialogue '{dialogueId}' was not found in the assigned database.");
            if (!dialogue.TryGetNode(dialogue.StartNodeId, out var startNode))
                throw new InvalidOperationException($"Dialogue '{dialogueId}' has no valid start node.");
            return (dialogue, startNode);
        }

        // Called only when the runner or its managed screen is torn down.
        internal void StopDialogue()
        {
            if (IsDialogueActive)
            {
                if (_activeDialogueRoutine != null) StopCoroutine(_activeDialogueRoutine);
                CloseDialogue();
            }
        }

        public bool TryAdvanceActiveDialogue()
        {
            if (!IsDialogueActive)
                return false;

            return _advanceHandler != null && _advanceHandler.TryAdvanceDialogue();
        }

        private IEnumerator RunDialogue(VulcanusDialogueAsset startingDialogue, VulcanusDialogueNode currentNode,
            GameCharacter instigator, ScreenPauseMode? pauseWhileOpen)
        {
            _activeContext = new VulcanusDialogueExecutionContext
            {
                Database = database,
                Project = startingDialogue.Project != null ? startingDialogue.Project : database.Project,
                CurrentDialogue = startingDialogue,
                Self = ResolveSelf(startingDialogue),
                StepsExecuted = 0,
                Instigator = instigator,
                PauseWhileOpen = pauseWhileOpen
            };

            var completed = false;
            try
            {
                _presenter.OnDialogueStarted(_activeContext);
                while (currentNode != null)
                {
                    _activeContext.CurrentNode = currentNode;
                    _activeContext.StepsExecuted++;
                    if (_activeContext.StepsExecuted > maxStepsPerRun)
                    {
                        Debug.LogError($"Dialogue '{_activeContext.CurrentDialogue.DialogueId}' exceeded {maxStepsPerRun} steps.");
                        yield break;
                    }

                    if (!currentNode.IsExecutable)
                    {
                        _activeContext.CurrentDialogue.TryGetExecutableNodeAfter(currentNode.Id, out currentNode);
                        continue;
                    }

                    switch (currentNode)
                    {
                        case VulcanusDialogueLineNode line:
                            var text = _activeContext.CurrentDialogue.ResolveLocalizedText(line.MsgKey, line.Text);
                            yield return _presenter.PresentLine(line, text, _activeContext);
                            if (!TryResolveLocalNode(_activeContext.CurrentDialogue, line.Next, out currentNode)) yield break;
                            break;

                        case VulcanusDialogueChoiceNode choice:
                            if (!TryBuildVisibleOptions(choice, out var options)) yield break;
                            if (options.Count == 0)
                            {
                                Debug.LogError($"Choice '{choice.Id}' has zero visible options.");
                                yield break;
                            }
                            VulcanusDialogueChoiceOption selected = null;
                            yield return _presenter.PresentChoice(choice, options, _activeContext, option => selected = option);
                            if (selected == null)
                            {
                                Debug.LogError($"No option was selected for choice '{choice.Id}'.");
                                yield break;
                            }
                            if (!TryResolveLocalNode(_activeContext.CurrentDialogue, selected.TargetNodeId, out currentNode)) yield break;
                            break;

                        case VulcanusDialogueActionNode action:
                            if (!RunAction(action)) yield break;
                            if (!TryResolveLocalNode(_activeContext.CurrentDialogue, action.Next, out currentNode)) yield break;
                            break;

                        case VulcanusDialogueJumpNode jump:
                            if (!RunJump(jump, out currentNode)) yield break;
                            break;

                        case VulcanusDialogueEndNode:
                            currentNode = null;
                            break;

                        default:
                            Debug.LogError($"Unsupported dialogue node type '{currentNode.GetType().Name}'.");
                            yield break;
                    }
                }
                completed = true;
            }
            finally
            {
                // Only reaching the end of the flow calls the completion callback.
                if (completed) FinishDialogue();
                else CloseDialogue();
            }
        }

        private bool RunAction(VulcanusDialogueActionNode actionNode)
        {
            if (string.IsNullOrWhiteSpace(actionNode.Lua))
                return true;

            if (_scriptEngine.ExecuteAction(actionNode.Lua, _activeContext))
                return true;

            Debug.LogError($"[VulcanusDialogueRunner] Action node '{actionNode.Id}' failed.");
            return false;
        }

        private bool RunJump(VulcanusDialogueJumpNode jump, out VulcanusDialogueNode nextNode)
        {
            nextNode = null;
            if (string.IsNullOrWhiteSpace(jump.TargetNodeId))
            {
                Debug.LogError($"Jump '{jump.Id}' has an empty target node ID.");
                return false;
            }
            if (string.IsNullOrWhiteSpace(jump.TargetDialogueId))
                return TryResolveLocalNode(_activeContext.CurrentDialogue, jump.TargetNodeId, out nextNode);

            if (!database.TryGetDialogue(jump.TargetDialogueId, out var targetDialogue))
            {
                Debug.LogError($"Jump '{jump.Id}' references unknown dialogue '{jump.TargetDialogueId}'.");
                return false;
            }
            if (!TryResolveLocalNode(targetDialogue, jump.TargetNodeId, out nextNode)) return false;
            _activeContext.CurrentDialogue = targetDialogue;
            _activeContext.Project = targetDialogue.Project != null ? targetDialogue.Project : _activeContext.Project;
            _activeContext.Self = ResolveSelf(targetDialogue);
            return true;
        }

        private bool TryBuildVisibleOptions(VulcanusDialogueChoiceNode choice, out List<VulcanusDialogueChoiceOption> visibleOptions)
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
                if (!_scriptEngine.EvaluateCondition(option.Condition, _activeContext, out var isVisible)) return false;
                if (isVisible) visibleOptions.Add(option);
            }
            return true;
        }

        private object ResolveSelf(VulcanusDialogueAsset dialogue)
        {
            var project = dialogue.Project != null ? dialogue.Project : database.Project;
            // A resolver is optional for dialogues that have no self context.
            return _contextResolver?.ResolveSelf(project, dialogue);
        }

        private T ResolveInterface<T>(UnityEngine.Object configuredObject) where T : class
        {
            if (configuredObject != null)
                return configuredObject as T
                    ?? throw new InvalidOperationException($"Dialogue reference must implement {typeof(T).Name}.");
            return GetComponents<MonoBehaviour>().OfType<T>().FirstOrDefault();
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

        private void FinishDialogue()
        {
            var completed = _onCompleted;
            CloseDialogue();
            completed?.Invoke();
        }

        private void CloseDialogue()
        {
            if (!IsDialogueActive) return;
            var context = _activeContext;
            _activeDialogueRoutine = null;
            _activeContext = null;
            _onCompleted = null;
            _presenter.OnDialogueFinished(context);
        }
    }
}
