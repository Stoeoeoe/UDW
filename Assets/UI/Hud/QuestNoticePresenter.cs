using System;
using System.Collections.Generic;
using Core.Events;
using Core.Quests;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Hud
{
    /// <summary>Shows a short HUD notice when a quest starts, finishes a step, completes or fails; several queue up.</summary>
    [RequireComponent(typeof(UIDocument)), DisallowMultipleComponent]
    public sealed class QuestNoticePresenter : MonoBehaviour, IEventListener<QuestChangedEvent>
    {
        [SerializeField, Min(0.5f)] private float secondsShown = 3f;
        private readonly Queue<string> _waiting = new();
        private Label _notice;
        private float _hideAt;

        private void OnEnable()
        {
            _notice = GetComponent<UIDocument>().rootVisualElement.Q<Label>("questNotice")
                ?? throw new InvalidOperationException("The quest notice requires its questNotice label.");
            _notice.style.display = DisplayStyle.None;
            this.Subscribe<QuestChangedEvent>();
        }

        private void OnDisable()
        {
            this.Unsubscribe<QuestChangedEvent>();
            _waiting.Clear();
        }

        public void OnEvent(QuestChangedEvent e) => _waiting.Enqueue(e.Change switch
        {
            QuestChange.Started => $"New quest: {e.Quest.Title}",
            QuestChange.StepFinished => $"Quest updated: {e.Quest.Title}",
            QuestChange.Completed => $"Quest completed: {e.Quest.Title}",
            _ => $"Quest failed: {e.Quest.Title}"
        });

        // Unscaled: notices keep their pace while dialogues stop game time.
        private void Update()
        {
            if (Time.unscaledTime < _hideAt) return;
            if (_waiting.Count == 0)
            {
                _notice.style.display = DisplayStyle.None;
                return;
            }
            _notice.text = _waiting.Dequeue();
            _notice.style.display = DisplayStyle.Flex;
            _hideAt = Time.unscaledTime + secondsShown;
        }
    }
}
