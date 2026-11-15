using System;
using System.Linq;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Scripting;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using VContainer.Unity;

namespace Core.Quests
{
    /// <summary>A talk or deliver objective met by talking to its character, from <see cref="QuestService.FindConversation"/>.</summary>
    public sealed class QuestConversation
    {
        public string QuestId { get; }
        public string StepId { get; }
        public QuestObjective Objective { get; }
        /// <summary>The quest dialogue to play; empty for the character's usual one.</summary>
        public string DialogueId => Objective.DialogueId;

        internal QuestConversation(string questId, string stepId, QuestObjective objective)
        {
            QuestId = questId;
            StepId = stepId;
            Objective = objective;
        }
    }

    /// <summary>
    /// Runs quests: starts them, completes objectives and steps, and runs their Lua actions. Progress lives in the save
    /// (<see cref="GameState.Quests"/>) and is recorded before any action runs, so an action may advance the quest further.
    /// <para>
    /// The game meets have, reach and condition objectives by itself. It checks them on the frame after something they
    /// could depend on changes: the bag, the clock's step, a Lua call that writes state (dialogue, cutscene or quest
    /// actions), entering a location, or a new step beginning. Trigger areas are met when the player walks in.
    /// </para>
    /// </summary>
    public sealed class QuestService : ITickable, ILocationLifecycle, IDisposable,
        IEventListener<InventoryChangedEvent>, IEventListener<GameTimeChangedEvent>, IEventListener<MapTriggerEnteredEvent>
    {
        private readonly QuestCatalog _quests;
        private readonly ItemCatalog _items;
        private readonly GameState _gameState;
        private readonly LuaRuntime _lua;
        private readonly CharacterManager _characters;
        private VulcanusLuaEngine _conditions;
        private string _mapId;
        private bool _checkPending;

        public QuestService(QuestCatalog quests, ItemCatalog items, GameState gameState, LuaRuntime lua, CharacterManager characters)
        {
            _quests = quests;
            _items = items;
            _gameState = gameState;
            _lua = lua;
            _characters = characters;
            _lua.StateWritten += RequestCheck;
            EventBus<InventoryChangedEvent>.Subscribe(this);
            EventBus<GameTimeChangedEvent>.Subscribe(this);
            EventBus<MapTriggerEnteredEvent>.Subscribe(this);
        }

        public void Dispose()
        {
            _lua.StateWritten -= RequestCheck;
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            EventBus<GameTimeChangedEvent>.Unsubscribe(this);
            EventBus<MapTriggerEnteredEvent>.Unsubscribe(this);
        }

        public QuestDefinition Require(string questId) =>
            _quests.Get(questId) ?? throw new InvalidOperationException($"Unknown or disabled quest '{questId}'.");

        /// <summary>The quest's progress; null if it has not been started.</summary>
        public QuestProgress Find(string questId)
        {
            Require(questId);
            return _gameState.Quests.Find(questId);
        }

        public void Start(string questId)
        {
            var quest = Require(questId);
            if (_gameState.Quests.Find(questId) != null) throw new InvalidOperationException($"Quest '{questId}' has already been started.");
            _gameState.Quests.Add(questId, new QuestProgress
            {
                Status = QuestStatus.Active, StepId = quest.Steps[0].Id, StartedAtMinute = _gameState.Time.TotalMinutes
            });
            RequestCheck();
            Run(quest.OnStart);
        }

        /// <summary>Marks an objective of the current step done; the step completes once all of them are.</summary>
        public void CompleteObjective(string questId, string objectiveId)
        {
            var (quest, progress, step) = CurrentStep(questId);
            if (step.Objectives.All(objective => objective.Id != objectiveId))
                throw new InvalidOperationException($"Quest '{questId}' step '{step.Id}' has no objective '{objectiveId}'.");
            progress.CompletedObjectives.Add(objectiveId);
            if (step.Objectives.All(objective => progress.CompletedObjectives.Contains(objective.Id))) Finish(quest, progress, step);
        }

        /// <summary>Completes the current step, whatever its objectives.</summary>
        public void CompleteStep(string questId)
        {
            var (quest, progress, step) = CurrentStep(questId);
            Finish(quest, progress, step);
        }

        /// <summary>
        /// The talk or deliver objective that talking to this character would meet now, if any: deliver only while the
        /// player carries the items. Its dialogue, when set, plays instead of the character's usual one.
        /// </summary>
        public QuestConversation FindConversation(string characterId)
        {
            var player = _characters.MainCharacter;
            foreach (var questId in ActiveQuestIds())
            {
                var (quest, progress, step) = CurrentStep(questId);
                foreach (var objective in step.Objectives)
                    if (objective.CharacterId == characterId && !progress.CompletedObjectives.Contains(objective.Id) &&
                        (objective.Kind == QuestObjectiveKind.Talk || objective.Kind == QuestObjectiveKind.Deliver &&
                            player && player.MainInventory.Count(RequireItem(quest, objective)) >= objective.Count))
                        return new QuestConversation(questId, step.Id, objective);
            }
            return null;
        }

        /// <summary>
        /// Meets the objective once its conversation has ended, taking a delivery's items. Nothing happens if the step moved
        /// on meanwhile, or the player no longer has the items.
        /// </summary>
        public void CompleteConversation(QuestConversation conversation)
        {
            var progress = _gameState.Quests.Find(conversation.QuestId);
            if (progress?.Status != QuestStatus.Active || progress.StepId != conversation.StepId) return;
            var objective = conversation.Objective;
            if (objective.Kind == QuestObjectiveKind.Deliver &&
                !_characters.MainCharacter.MainInventory.TryRemove(RequireItem(Require(conversation.QuestId), objective), objective.Count))
                return;
            CompleteObjective(conversation.QuestId, objective.Id);
        }

        public void Tick()
        {
            if (!_checkPending) return;
            _checkPending = false;
            var player = _characters.MainCharacter;
            if (!player) return; // Nothing can be met before the player exists; entering a location checks again.
            // Failure first: a step whose deadline has passed is too late, even if it would be met now.
            foreach (var questId in ActiveQuestIds())
            {
                var (quest, progress, step) = CurrentStep(questId);
                if (step.HasDeadline && _gameState.Time.TotalMinutes >= step.DeadlineAtMinute(progress.StepStartedAtMinute) ||
                    !string.IsNullOrWhiteSpace(step.FailWhen) && Conditions.EvaluateCondition(step.FailWhen))
                    Fail(quest, progress);
            }
            ForEachOpenObjective((quest, objective) => objective.Kind switch
            {
                QuestObjectiveKind.Have => player.MainInventory.Count(RequireItem(quest, objective)) >= objective.Count,
                QuestObjectiveKind.Reach => string.IsNullOrEmpty(objective.TriggerId) && objective.MapId == _mapId,
                QuestObjectiveKind.Condition => Conditions.EvaluateCondition(objective.Condition),
                _ => false
            });
        }

        public void OnEvent(InventoryChangedEvent e)
        {
            if (e.InventoryRef == _characters.MainCharacter?.MainInventory) RequestCheck();
        }

        public void OnEvent(GameTimeChangedEvent e) => RequestCheck();

        public void OnEvent(MapTriggerEnteredEvent e) => ForEachOpenObjective((_, objective) =>
            objective.Kind == QuestObjectiveKind.Reach && objective.MapId == _mapId && objective.TriggerId == e.TriggerId);

        public void OnLocationEnter(LocationData location)
        {
            _mapId = location.id;
            RequestCheck();
        }

        public void OnLocationLeave(LocationData location) => _mapId = null;

        private void RequestCheck() => _checkPending = true;

        private VulcanusLuaEngine Conditions => _conditions ??= _lua.CreateEngine();

        /// <summary>The quest fails on its current step, which it keeps for the journal, and runs its fail actions.</summary>
        private void Fail(QuestDefinition quest, QuestProgress progress)
        {
            progress.Status = QuestStatus.Failed;
            progress.CompletedObjectives.Clear();
            Run(quest.OnFail);
        }

        /// <summary>Completes each open objective of the active quests' current steps that is met.</summary>
        private void ForEachOpenObjective(Func<QuestDefinition, QuestObjective, bool> isMet)
        {
            foreach (var questId in ActiveQuestIds())
            {
                var (quest, progress, step) = CurrentStep(questId);
                foreach (var objective in step.Objectives)
                {
                    if (progress.StepId != step.Id || progress.Status != QuestStatus.Active) break; // A finished step checks again next frame.
                    if (!progress.CompletedObjectives.Contains(objective.Id) && isMet(quest, objective))
                        CompleteObjective(questId, objective.Id);
                }
            }
        }

        private string[] ActiveQuestIds() =>
            _gameState.Quests.All.Where(pair => pair.Value.Status == QuestStatus.Active).Select(pair => pair.Key).ToArray();

        private ItemDefinition RequireItem(QuestDefinition quest, QuestObjective objective) => _items.Find(objective.ItemId) ??
            throw new InvalidOperationException($"Quest '{quest.QuestId}' needs the unknown item '{objective.ItemId}'.");

        private (QuestDefinition, QuestProgress, QuestStep) CurrentStep(string questId)
        {
            var quest = Require(questId);
            var progress = _gameState.Quests.Find(questId);
            if (progress?.Status != QuestStatus.Active) throw new InvalidOperationException($"Quest '{questId}' is not active.");
            var step = quest.Steps.FirstOrDefault(candidate => candidate.Id == progress.StepId)
                ?? throw new InvalidOperationException($"Quest '{questId}' has no step '{progress.StepId}'.");
            return (quest, progress, step);
        }

        private void Finish(QuestDefinition quest, QuestProgress progress, QuestStep step)
        {
            progress.FinishedSteps.Add(new FinishedQuestStep { StepId = step.Id, AtMinute = _gameState.Time.TotalMinutes });
            progress.CompletedObjectives.Clear();
            var next = Array.IndexOf(quest.Steps, step) + 1;
            var completed = next == quest.Steps.Length;
            progress.StepId = completed ? null : quest.Steps[next].Id;
            if (completed) progress.Status = QuestStatus.Completed;
            else RequestCheck(); // The new step's objectives may already be met.
            Run(step.OnComplete);
            if (completed) Run(quest.OnComplete);
        }

        private void Run(string lua)
        {
            if (!string.IsNullOrWhiteSpace(lua)) _lua.CreateEngine().Execute(lua);
        }
    }
}
