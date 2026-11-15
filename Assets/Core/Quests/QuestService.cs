using System;
using System.Linq;
using Core.Game;
using Core.Scripting;

namespace Core.Quests
{
    /// <summary>
    /// Runs quests: starts them, completes objectives and steps, and runs their Lua actions. Progress lives in the save
    /// (<see cref="GameState.Quests"/>) and is recorded before any action runs, so an action may advance the quest further.
    /// </summary>
    public sealed class QuestService
    {
        private readonly QuestCatalog _quests;
        private readonly GameState _gameState;
        private readonly LuaRuntime _lua;

        public QuestService(QuestCatalog quests, GameState gameState, LuaRuntime lua)
        {
            _quests = quests;
            _gameState = gameState;
            _lua = lua;
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
            Run(step.OnComplete);
            if (completed) Run(quest.OnComplete);
        }

        private void Run(string lua)
        {
            if (!string.IsNullOrWhiteSpace(lua)) _lua.CreateEngine().Execute(lua);
        }
    }
}
