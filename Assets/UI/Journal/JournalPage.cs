using System.Linq;
using Core.Quests;
using UnityEngine.UIElements;

namespace UI.Journal
{
    /// <summary>
    /// The game menu's journal (<c>JournalPage.uxml</c>): active, completed and failed quests, and for the selected one its
    /// description, the steps it went through with their day, and the current step's objectives and deadline. All text
    /// comes from the quest definitions, so edits and translations reach existing saves.
    /// </summary>
    public sealed class JournalPage
    {
        private const int MinutesPerDay = 24 * 60;
        private readonly ScrollView _list, _details;
        private readonly QuestService _quests;
        private string _selected;

        public JournalPage(VisualElement page, QuestService quests)
        {
            _list = page.Q<ScrollView>("journalList");
            _details = page.Q<ScrollView>("journalDetails");
            _quests = quests;
        }

        /// <summary>Shows the current quests. Call whenever the page is shown.</summary>
        public void Show()
        {
            var started = _quests.Started.ToArray();
            if (started.All(entry => entry.Quest.Id != _selected))
                _selected = (started.FirstOrDefault(entry => entry.Progress.Status == QuestStatus.Active).Quest ?? started.FirstOrDefault().Quest)?.Id;
            _list.Clear();
            if (started.Length == 0) _list.Add(Line("No quests yet.", "inventory-hint"));
            foreach (var (status, heading) in new[] { (QuestStatus.Active, "Active"), (QuestStatus.Completed, "Completed"), (QuestStatus.Failed, "Failed") })
            {
                var group = started.Where(entry => entry.Progress.Status == status).ToArray();
                if (group.Length == 0) continue;
                _list.Add(Line(heading, "inventory-kicker", "journal-section"));
                foreach (var (quest, _) in group)
                {
                    var entry = new Button(() => { _selected = quest.Id; Show(); }) { text = quest.TranslatedTitle };
                    entry.AddToClassList("quiet-action");
                    entry.AddToClassList("journal-entry");
                    if (quest.Id == _selected) entry.AddToClassList("journal-entry-selected");
                    _list.Add(entry);
                }
            }
            ShowDetails(started.FirstOrDefault(entry => entry.Quest.Id == _selected));
        }

        private void ShowDetails((QuestDefinition Quest, QuestProgress Progress) entry)
        {
            _details.Clear();
            var (quest, progress) = entry;
            if (quest == null) return;
            _details.Add(Line(quest.TranslatedTitle, "inventory-selection"));
            _details.Add(Line(quest.TranslatedDescription, "inventory-description"));
            foreach (var finished in progress.FinishedSteps)
                _details.Add(Line($"{quest.TranslatedJournal(Step(quest, finished.StepId))} · {When(finished.AtMinute)}", "inventory-description", "journal-done"));

            if (progress.Status == QuestStatus.Completed)
            {
                _details.Add(Line("Completed.", "inventory-kicker", "journal-section"));
                return;
            }
            var step = Step(quest, progress.StepId);
            if (progress.Status == QuestStatus.Failed)
            {
                _details.Add(Line($"Failed: {quest.TranslatedJournal(step)}", "inventory-kicker", "journal-section"));
                return;
            }
            _details.Add(Line(quest.TranslatedJournal(step), "inventory-kicker", "journal-section"));
            foreach (var objective in step.Objectives)
            {
                var done = progress.CompletedObjectives.Contains(objective.Id);
                var count = !done && objective.Kind is QuestObjectiveKind.Have or QuestObjectiveKind.Deliver
                    ? $": {_quests.Carried(quest, objective)}/{objective.Count}" : "";
                _details.Add(done
                    ? Line($"Done · {quest.TranslatedText(step, objective)}", "inventory-description", "journal-done")
                    : Line(quest.TranslatedText(step, objective) + count, "inventory-description"));
            }
            if (step.HasDeadline)
            {
                var deadline = step.DeadlineAtMinute(progress.StepStartedAtMinute);
                _details.Add(Line(step.Deadline.At < 0 ? $"Due by the end of day {deadline / MinutesPerDay}" : $"Due {When(deadline)}", "inventory-hint"));
            }
        }

        private static QuestStep Step(QuestDefinition quest, string stepId) => quest.Steps.First(step => step.Id == stepId);

        /// <summary>A saved game minute as the player reads it: the day since the game began and the time.</summary>
        private static string When(long minute) =>
            $"day {minute / MinutesPerDay + 1}, {minute % MinutesPerDay / 60:00}:{minute % 60:00}";

        private static Label Line(string text, params string[] classes)
        {
            var label = new Label(text);
            label.AddToClassList("journal-line");
            foreach (var name in classes) label.AddToClassList(name);
            return label;
        }
    }
}
