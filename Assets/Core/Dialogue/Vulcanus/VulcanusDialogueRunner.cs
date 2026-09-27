using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Core.Scripting;
using UnityEngine;

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
        private readonly VulcanusLuaDialogueScriptEngine _scriptEngine = new(new VulcanusLuaEngine());

        private IDialogueContextResolver ContextResolver => ResolveInterface<IDialogueContextResolver>(contextResolver);
        private IDialoguePresenter Presenter => ResolveInterface<IDialoguePresenter>(presenter);
        private IDialogueAdvanceHandler AdvanceHandler => ResolveInterface<IDialogueAdvanceHandler>(presenter);

        public VulcanusDialogueExecutionContext ActiveContext => _activeContext;
        public string CurrentDialogueId => _activeContext?.CurrentDialogue?.DialogueId;

        public string CurrentSpeakerId =>
            _activeContext?.CurrentNode is VulcanusDialogueLineNode lineNode ? lineNode.Speaker : null;

        public bool IsDialogueActive => _activeDialogueRoutine != null;

        private void Awake()
        {
            if (Instance == null || Instance == this)
            {
                Instance = this;
                return;
            }

            Debug.LogWarning(
                "[VulcanusDialogueRunner] Multiple dialogue runners are active. Using the most recently awakened instance.");
            Instance = this;
        }

        private void OnDestroy()
        {
            if (Instance == this)
                Instance = null;
        }

        public bool StartDialogue(string dialogueId)
        {
            if (database == null)
            {
                Debug.LogError("[VulcanusDialogueRunner] No dialogue database assigned.");
                return false;
            }

            if (!database.TryGetDialogue(dialogueId, out var dialogue))
            {
                Debug.LogError($"[VulcanusDialogueRunner] Dialogue '{dialogueId}' was not found.");
                return false;
            }

            if (_activeDialogueRoutine != null)
                StopCoroutine(_activeDialogueRoutine);

            _activeDialogueRoutine = StartCoroutine(RunDialogue(dialogue));
            return true;
        }

        public void CancelDialogue()
        {
            if (_activeDialogueRoutine != null)
            {
                StopCoroutine(_activeDialogueRoutine);
                FinishDialogue();
            }
        }

        public bool TryAdvanceActiveDialogue()
        {
            if (!IsDialogueActive)
                return false;

            return AdvanceHandler != null && AdvanceHandler.TryAdvanceDialogue();
        }

        private IEnumerator RunDialogue(VulcanusDialogueAsset startingDialogue)
        {
            _activeContext = new VulcanusDialogueExecutionContext
            {
                Database = database,
                Project = startingDialogue != null && startingDialogue.Project != null
                    ? startingDialogue.Project
                    : database != null
                        ? database.Project
                        : null,
                CurrentDialogue = startingDialogue,
                Self = ResolveSelf(startingDialogue),
                StepsExecuted = 0
            };

            Presenter?.OnDialogueStarted(_activeContext);

            if (!TryResolveStartNode(startingDialogue, out var currentNode))
            {
                Debug.LogError(
                    $"[VulcanusDialogueRunner] Dialogue '{startingDialogue?.DialogueId}' has no valid start node.");
                FinishDialogue();
                yield break;
            }

            while (currentNode != null)
            {
                _activeContext.CurrentNode = currentNode;
                _activeContext.StepsExecuted++;

                if (_activeContext.StepsExecuted > Mathf.Max(1, maxStepsPerRun))
                {
                    Debug.LogError(
                        $"[VulcanusDialogueRunner] Dialogue '{_activeContext.CurrentDialogue?.DialogueId}' exceeded the loop guard ({maxStepsPerRun} steps).");
                    break;
                }

                if (!currentNode.IsExecutable)
                {
                    if (_activeContext.CurrentDialogue.TryGetExecutableNodeAfter(currentNode.Id,
                            out var nextExecutable))
                    {
                        currentNode = nextExecutable;
                        continue;
                    }

                    break;
                }

                switch (currentNode)
                {
                    case VulcanusDialogueLineNode lineNode:
                        yield return RunLine(lineNode);
                        currentNode = ResolveLocalNode(_activeContext.CurrentDialogue, lineNode.Next);
                        break;

                    case VulcanusDialogueChoiceNode choiceNode:
                        yield return RunChoice(choiceNode, nextNode => currentNode = nextNode);
                        break;

                    case VulcanusDialogueActionNode actionNode:
                        if (!RunAction(actionNode))
                        {
                            currentNode = null;
                            break;
                        }

                        currentNode = ResolveLocalNode(_activeContext.CurrentDialogue, actionNode.Next);
                        break;

                    case VulcanusDialogueJumpNode jumpNode:
                        if (!RunJump(jumpNode, out currentNode))
                            currentNode = null;
                        break;

                    case VulcanusDialogueEndNode:
                        currentNode = null;
                        break;

                    default:
                        Debug.LogError(
                            $"[VulcanusDialogueRunner] Unsupported node type '{currentNode.GetType().Name}'.");
                        currentNode = null;
                        break;
                }
            }

            FinishDialogue();
        }

        private bool TryResolveStartNode(VulcanusDialogueAsset dialogue, out VulcanusDialogueNode startNode)
        {
            startNode = null;
            if (dialogue == null)
                return false;

            if (dialogue.TryGetNode(dialogue.StartNodeId, out startNode) && startNode != null)
                return true;

            return dialogue.TryGetExecutableNodeAfter(string.Empty, out startNode);
        }

        private IEnumerator RunLine(VulcanusDialogueLineNode lineNode)
        {
            var localizedText = _activeContext.CurrentDialogue.ResolveLocalizedText(lineNode.MsgKey, lineNode.Text);
            if (Presenter != null)
            {
                yield return Presenter.PresentLine(lineNode, localizedText, _activeContext);
                yield break;
            }

            yield return null;
        }

        private IEnumerator RunChoice(VulcanusDialogueChoiceNode choiceNode, Action<VulcanusDialogueNode> setNextNode)
        {
            var visibleOptions = BuildVisibleOptions(choiceNode);
            if (visibleOptions.Count == 0)
            {
                Debug.LogError(
                    $"[VulcanusDialogueRunner] Choice node '{choiceNode.Id}' in dialogue '{_activeContext.CurrentDialogue?.DialogueId}' has zero visible options.");
                setNextNode(null);
                yield break;
            }

            VulcanusDialogueChoiceOption selectedOption = null;
            if (Presenter != null)
            {
                yield return Presenter.PresentChoice(choiceNode, visibleOptions, _activeContext,
                    option => selectedOption = option);
            }
            else
            {
                selectedOption = visibleOptions[0];
                yield return null;
            }

            if (selectedOption == null)
            {
                Debug.LogError($"[VulcanusDialogueRunner] No option was selected for choice node '{choiceNode.Id}'.");
                setNextNode(null);
                yield break;
            }

            setNextNode(ResolveLocalNode(_activeContext.CurrentDialogue, selectedOption.TargetNodeId));
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

        private bool RunJump(VulcanusDialogueJumpNode jumpNode, out VulcanusDialogueNode nextNode)
        {
            nextNode = null;

            if (string.IsNullOrWhiteSpace(jumpNode.TargetNodeId))
            {
                Debug.LogError($"[VulcanusDialogueRunner] Jump node '{jumpNode.Id}' has an empty target node id.");
                return false;
            }

            if (string.IsNullOrWhiteSpace(jumpNode.TargetDialogueId))
            {
                nextNode = ResolveLocalNode(_activeContext.CurrentDialogue, jumpNode.TargetNodeId);
                if (nextNode != null)
                    return true;

                Debug.LogError(
                    $"[VulcanusDialogueRunner] Jump node '{jumpNode.Id}' references missing local node '{jumpNode.TargetNodeId}'.");
                return false;
            }

            if (database == null || !database.TryGetDialogue(jumpNode.TargetDialogueId, out var targetDialogue))
            {
                Debug.LogError(
                    $"[VulcanusDialogueRunner] Jump node '{jumpNode.Id}' references unknown dialogue '{jumpNode.TargetDialogueId}'.");
                return false;
            }

            _activeContext.CurrentDialogue = targetDialogue;
            _activeContext.Project = targetDialogue.Project != null ? targetDialogue.Project : _activeContext.Project;
            _activeContext.Self = ResolveSelf(targetDialogue);
            nextNode = ResolveLocalNode(targetDialogue, jumpNode.TargetNodeId);
            if (nextNode != null)
                return true;

            Debug.LogError(
                $"[VulcanusDialogueRunner] Jump node '{jumpNode.Id}' references missing node '{jumpNode.TargetNodeId}' in dialogue '{targetDialogue.DialogueId}'.");
            return false;
        }

        private List<VulcanusDialogueChoiceOption> BuildVisibleOptions(VulcanusDialogueChoiceNode choiceNode)
        {
            var visibleOptions = new List<VulcanusDialogueChoiceOption>();
            var options = choiceNode.Options ?? Array.Empty<VulcanusDialogueChoiceOption>();

            for (var i = 0; i < options.Length; i++)
            {
                var option = options[i];
                if (option == null || string.IsNullOrWhiteSpace(option.TargetNodeId))
                    continue;

                if (string.IsNullOrWhiteSpace(option.Condition))
                {
                    visibleOptions.Add(option);
                    continue;
                }

                if (_scriptEngine.EvaluateCondition(option.Condition, _activeContext, out var isVisible) && isVisible)
                    visibleOptions.Add(option);
            }

            return visibleOptions;
        }

        private object ResolveSelf(VulcanusDialogueAsset dialogue)
        {
            var project = dialogue != null && dialogue.Project != null ? dialogue.Project :
                database != null ? database.Project : null;
            return ContextResolver != null ? ContextResolver.ResolveSelf(project, dialogue) : null;
        }

        private T ResolveInterface<T>(UnityEngine.Object configuredObject) where T : class
        {
            if (configuredObject is T typedObject)
                return typedObject;

            return GetComponents<MonoBehaviour>().OfType<T>().FirstOrDefault();
        }

        private static VulcanusDialogueNode ResolveLocalNode(VulcanusDialogueAsset dialogue, string nodeId)
        {
            if (dialogue == null || string.IsNullOrWhiteSpace(nodeId))
                return null;

            return dialogue.TryGetNode(nodeId, out var node) ? node : null;
        }

        private void FinishDialogue()
        {
            Presenter?.OnDialogueFinished(_activeContext);
            _activeDialogueRoutine = null;
            _activeContext = null;
        }
    }
}
