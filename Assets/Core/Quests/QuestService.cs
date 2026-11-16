using System;
using System.Collections.Generic;
using System.Linq;
using Core.Divinity;
using Core.Events;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Scripting;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using Core.TimeAndWeather.Seasons;
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
        public string DialogueId => Objective.Dialogue;

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
        IEventListener<InventoryChangedEvent>, IEventListener<GameTimeChangedEvent>, IEventListener<MapTriggerEnteredEvent>,
        IEventListener<NewDayEvent>, IEventListener<DivineFavourChangedEvent>, IEventListener<GameStartedEvent>
    {
        /// <summary>Something that happened, which quests that start by themselves may be waiting for.</summary>
        private readonly struct Moment
        {
            public readonly QuestStartKind Kind;
            public readonly string Season, Deity, Map;
            public readonly int Favour;

            public Moment(QuestStartKind kind, string season = null, string deity = null, int favour = 0, string map = null)
            {
                Kind = kind;
                Season = season;
                Deity = deity;
                Favour = favour;
                Map = map;
            }
        }

        private readonly QuestCatalog _quests;
        private readonly ItemCatalog _items;
        private readonly GameState _gameState;
        private readonly LuaRuntime _lua;
        private readonly CharacterManager _characters;
        private VulcanusLuaEngine _conditions;
        private string _mapId;
        private bool _checkPending;
        private readonly List<Moment> _moments = new();

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
            EventBus<NewDayEvent>.Subscribe(this);
            EventBus<DivineFavourChangedEvent>.Subscribe(this);
            EventBus<GameStartedEvent>.Subscribe(this);
            SeasonStartEvent.Register(OnSeasonStarted);
        }

        public void Dispose()
        {
            _lua.StateWritten -= RequestCheck;
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            EventBus<GameTimeChangedEvent>.Unsubscribe(this);
            EventBus<MapTriggerEnteredEvent>.Unsubscribe(this);
            EventBus<NewDayEvent>.Unsubscribe(this);
            EventBus<DivineFavourChangedEvent>.Unsubscribe(this);
            EventBus<GameStartedEvent>.Unsubscribe(this);
            SeasonStartEvent.Unregister(OnSeasonStarted);
        }

        public QuestDefinition Require(string questId) =>
            _quests.Get(questId) ?? throw new InvalidOperationException($"Unknown or disabled quest '{questId}'.");

        /// <summary>The quest's progress; null if it has not been started.</summary>
        public QuestProgress Find(string questId)
        {
            Require(questId);
            return _gameState.Quests.Find(questId);
        }

        /// <summary>Every started quest, in the order they began, for the journal.</summary>
        public IEnumerable<(QuestDefinition Quest, QuestProgress Progress)> Started =>
            _gameState.Quests.All.Select(pair => (Require(pair.Key), pair.Value));

        /// <summary>Have and deliver: how many of the item the player carries, up to the objective's count.</summary>
        public int Carried(QuestDefinition quest, QuestObjective objective) =>
            Math.Min(_characters.MainCharacter.MainInventory.Count(RequireItem(quest, objective)), objective.Count);

        public void Start(string questId)
        {
            var quest = Require(questId);
            if (_gameState.Quests.Find(questId) != null) throw new InvalidOperationException($"Quest '{questId}' has already been started.");
            _gameState.Quests.Add(questId, new QuestProgress
            {
                Status = QuestStatus.Active, StepId = quest.Steps[0].Id, StartedAtMinute = _gameState.Time.TotalMinutes
            });
            RequestCheck();
            QuestChangedEvent.Trigger(quest, QuestChange.Started);
            Run(quest.OnStart);
        }

        /// <summary>
        /// Marks an objective of the current step done. An objective with a next completes the step at once and continues
        /// there; otherwise the step completes once all objectives without a next are done.
        /// </summary>
        public void CompleteObjective(string questId, string objectiveId)
        {
            var (quest, progress, step) = CurrentStep(questId);
            var objective = step.Objectives.FirstOrDefault(candidate => candidate.Id == objectiveId)
                ?? throw new InvalidOperationException($"Quest '{questId}' step '{step.Id}' has no objective '{objectiveId}'.");
            progress.CompletedObjectives.Add(objectiveId);
            if (objective.Branches) Finish(quest, progress, step, objective.Next);
            else if (step.Objectives.Where(candidate => !candidate.Branches).All(candidate => progress.CompletedObjectives.Contains(candidate.Id)))
                Finish(quest, progress, step, quest.NextStepId(step, Conditions.EvaluateCondition));
        }

        /// <summary>Completes the current step, whatever its objectives, and continues to the step's next.</summary>
        public void CompleteStep(string questId)
        {
            var (quest, progress, step) = CurrentStep(questId);
            Finish(quest, progress, step, quest.NextStepId(step, Conditions.EvaluateCondition));
        }

        /// <summary>Completes the current step and continues at the named step, or <see cref="QuestStep.End"/> to complete the quest.</summary>
        public void GoToStep(string questId, string stepId)
        {
            var (quest, progress, step) = CurrentStep(questId);
            Finish(quest, progress, step, stepId);
        }

        /// <summary>Whether an active quest's current step has an open talk or deliver objective for this character.</summary>
        public bool HasObjectiveFor(string characterId) => ActiveQuestIds().Any(questId =>
        {
            var (_, progress, step) = CurrentStep(questId);
            return step.Objectives.Any(objective => objective.Character == characterId &&
                objective.Kind is QuestObjectiveKind.Talk or QuestObjectiveKind.Deliver &&
                !progress.CompletedObjectives.Contains(objective.Id));
        });

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
                    if (objective.Character == characterId && !progress.CompletedObjectives.Contains(objective.Id) &&
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
            if (!_checkPending && _moments.Count == 0) return;
            var player = _characters.MainCharacter;
            if (!player) return; // Nothing can be met or started before the player exists; entering a location checks again.
            _checkPending = false;
            StartByMoments();
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
                QuestObjectiveKind.Reach => string.IsNullOrEmpty(objective.Trigger) && objective.Map == _mapId,
                QuestObjectiveKind.Condition => Conditions.EvaluateCondition(objective.Condition),
                _ => false
            });
        }

        public void OnEvent(InventoryChangedEvent e)
        {
            if (e.InventoryRef == _characters.MainCharacter?.MainInventory) RequestCheck();
        }

        public void OnEvent(GameTimeChangedEvent e)
        {
            RequestCheck();
            _moments.Add(new Moment(QuestStartKind.EveryTenMinutes));
        }

        public void OnEvent(NewDayEvent e) => _moments.Add(new Moment(QuestStartKind.NewDay));

        public void OnEvent(GameStartedEvent e) => _moments.Add(new Moment(QuestStartKind.GameStart));

        public void OnEvent(DivineFavourChangedEvent e) =>
            _moments.Add(new Moment(QuestStartKind.DivineFavour, deity: e.DeityId, favour: e.NewFavour));

        // The clock has already set the new season when it announces it.
        private void OnSeasonStarted(SeasonData _) =>
            _moments.Add(new Moment(QuestStartKind.NewSeason, season: _gameState.Time.season.ToString()));

        public void OnEvent(MapTriggerEnteredEvent e) => ForEachOpenObjective((_, objective) =>
            objective.Kind == QuestObjectiveKind.Reach && objective.Map == _mapId && objective.Trigger == e.TriggerId);

        public void OnLocationEnter(LocationData location)
        {
            _mapId = location.id;
            RequestCheck();
            _moments.Add(new Moment(QuestStartKind.LocationChanged, map: location.id));
        }

        public void OnLocationLeave(LocationData location) => _mapId = null;

        private void RequestCheck() => _checkPending = true;

        /// <summary>Starts each quest that never has been and is waiting for one of the moments that came, if its condition holds.</summary>
        private void StartByMoments()
        {
            var moments = _moments.ToArray();
            _moments.Clear();
            foreach (var quest in _quests.EnabledDefinitions)
                if (_gameState.Quests.Find(quest.Id) == null && quest.Start.When.Any(when => moments.Any(moment => Matches(when, moment))) &&
                    (string.IsNullOrWhiteSpace(quest.Start.Condition) || Conditions.EvaluateCondition(quest.Start.Condition)))
                    Start(quest.Id);
        }

        private static bool Matches(QuestStartMoment when, Moment moment) => when.On == moment.Kind && when.On switch
        {
            QuestStartKind.NewSeason => string.IsNullOrEmpty(when.Season) || string.Equals(when.Season, moment.Season, StringComparison.OrdinalIgnoreCase),
            QuestStartKind.DivineFavour => (string.IsNullOrEmpty(when.Deity) || when.Deity == moment.Deity) && moment.Favour >= when.AtLeast,
            QuestStartKind.LocationChanged => string.IsNullOrEmpty(when.Map) || string.Equals(when.Map, moment.Map, StringComparison.OrdinalIgnoreCase),
            _ => true
        };

        private VulcanusLuaEngine Conditions => _conditions ??= _lua.CreateEngine();

        /// <summary>The quest fails on its current step, which it keeps for the journal, and runs its fail actions.</summary>
        private void Fail(QuestDefinition quest, QuestProgress progress)
        {
            progress.Status = QuestStatus.Failed;
            progress.CompletedObjectives.Clear();
            QuestChangedEvent.Trigger(quest, QuestChange.Failed);
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

        private ItemDefinition RequireItem(QuestDefinition quest, QuestObjective objective) => _items.Find(objective.Item) ??
            throw new InvalidOperationException($"Quest '{quest.Id}' needs the unknown item '{objective.Item}'.");

        private (QuestDefinition, QuestProgress, QuestStep) CurrentStep(string questId)
        {
            var quest = Require(questId);
            var progress = _gameState.Quests.Find(questId);
            if (progress?.Status != QuestStatus.Active) throw new InvalidOperationException($"Quest '{questId}' is not active.");
            var step = quest.Steps.FirstOrDefault(candidate => candidate.Id == progress.StepId)
                ?? throw new InvalidOperationException($"Quest '{questId}' has no step '{progress.StepId}'.");
            return (quest, progress, step);
        }

        /// <summary>Finishes the step and continues at <paramref name="nextStepId"/>: a step ID, or <see cref="QuestStep.End"/>.</summary>
        private void Finish(QuestDefinition quest, QuestProgress progress, QuestStep step, string nextStepId)
        {
            var completed = nextStepId == QuestStep.End;
            if (!completed && quest.Steps.All(candidate => candidate.Id != nextStepId))
                throw new InvalidOperationException($"Quest '{quest.Id}' has no step '{nextStepId}' to continue to.");
            progress.FinishedSteps.Add(new FinishedQuestStep { StepId = step.Id, AtMinute = _gameState.Time.TotalMinutes });
            progress.CompletedObjectives.Clear();
            progress.StepId = completed ? null : nextStepId;
            if (completed) progress.Status = QuestStatus.Completed;
            else RequestCheck(); // The new step's objectives may already be met.
            QuestChangedEvent.Trigger(quest, completed ? QuestChange.Completed : QuestChange.StepFinished);
            Run(step.OnComplete);
            if (completed) Run(quest.OnComplete);
        }

        private void Run(string lua)
        {
            if (!string.IsNullOrWhiteSpace(lua)) _lua.CreateEngine().Execute(lua);
        }
    }
}
