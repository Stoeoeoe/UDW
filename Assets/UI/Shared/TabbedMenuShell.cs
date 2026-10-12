using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UI.Shared
{
    [Serializable]
    public sealed class MenuPageDefinition
    {
        public string Id;
        public string Title;
        public VisualTreeAsset Layout;
        [TextArea] public string Placeholder = "This page is not available yet.";
    }

    /// <summary>Reusable menu navigation and page presentation, independent of page gameplay.</summary>
    public sealed class TabbedMenuShell : IDisposable
    {
        private sealed class Page
        {
            public string Id;
            public string Title;
            public VisualElement Content;
            public Button Tab;
            public Func<bool> CanLeave;
            public Action Shown;
            public Action Hidden;
        }

        private readonly List<Page> _pages = new();
        private readonly VisualElement _tabs, _content, _backdrop;
        private readonly Label _title;
        private readonly Button _close;
        private readonly Func<bool> _receivesInput, _beforeChange;
        private readonly Action _onChanged, _onClose;
        public VisualElement Overlay { get; }
        public string SelectedPageId { get; private set; }
        public bool IsOpen { get; private set; }
        public int PageCount => _pages.Count;

        public TabbedMenuShell(VisualElement root, Func<bool> receivesInput,
            Func<bool> beforeChange, Action onChanged, Action onClose)
        {
            if (root == null) throw new ArgumentNullException(nameof(root));
            if (receivesInput == null) throw new ArgumentNullException(nameof(receivesInput));
            if (onClose == null) throw new ArgumentNullException(nameof(onClose));
            Overlay = root.Q("menuOverlay") ?? throw new ArgumentException("Menu overlay is missing.");
            _tabs = root.Q("menuTabs") ?? throw new ArgumentException("Menu tabs are missing.");
            _content = root.Q("menuContent") ?? throw new ArgumentException("Menu content is missing.");
            _title = root.Q<Label>("screenTitle") ?? throw new ArgumentException("Menu title is missing.");
            _close = root.Q<Button>("closeButton") ?? throw new ArgumentException("Menu close button is missing.");
            _backdrop = root.Q("menuBackdrop") ?? throw new ArgumentException("Menu backdrop is missing.");
            _receivesInput = receivesInput; _beforeChange = beforeChange;
            _onChanged = onChanged; _onClose = onClose;
            _close.clicked += Close;
            _backdrop.RegisterCallback<ClickEvent>(OnBackdropClicked);
            _tabs.RegisterCallback<KeyDownEvent>(OnTabKey);
        }

        public void RegisterPage(string id, string title, VisualElement content,
            Func<bool> canLeave = null, Action shown = null, Action hidden = null)
        {
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(title) || content == null)
                throw new ArgumentException("A menu page needs an ID, title and content.");
            if (_pages.Exists(p => p.Id == id)) throw new ArgumentException($"Duplicate menu page ID: {id}");
            var tab = new Button(() => SelectPage(id)) { name = $"{id}Tab", text = title };
            tab.AddToClassList("menu-tab");
            var page = new Page { Id = id, Title = title, Content = content, Tab = tab,
                CanLeave = canLeave, Shown = shown, Hidden = hidden };
            content.style.display = DisplayStyle.None;
            _content.Add(content); _tabs.Add(tab); _pages.Add(page);
        }

        public VisualElement RegisterPage(MenuPageDefinition definition)
        {
            if (definition == null) throw new ArgumentNullException(nameof(definition));
            VisualElement content;
            if (definition.Layout) content = definition.Layout.Instantiate();
            else
            {
                content = new VisualElement(); content.AddToClassList("menu-placeholder");
                var message = new Label(definition.Placeholder); message.AddToClassList("menu-placeholder-copy");
                content.Add(message);
            }
            content.name = $"{definition.Id}Page";
            RegisterPage(definition.Id, definition.Title, content);
            return content;
        }

        public bool SelectPage(string id, bool notify = true)
        {
            var next = _pages.Find(p => p.Id == id);
            if (next == null || notify && !_receivesInput()) return false;
            if (SelectedPageId == id) return true;
            var previous = _pages.Find(p => p.Id == SelectedPageId);
            if (notify && ((_beforeChange != null && !_beforeChange()) ||
                (previous?.CanLeave != null && !previous.CanLeave()))) return false;
            if (IsOpen) previous?.Hidden?.Invoke();
            SelectedPageId = id;
            foreach (var page in _pages)
            {
                var selected = page == next;
                page.Content.style.display = selected ? DisplayStyle.Flex : DisplayStyle.None;
                page.Tab.EnableInClassList("menu-tab-active", selected);
            }
            _title.text = next.Title;
            if (IsOpen) next.Shown?.Invoke();
            if (notify)
            {
                _onChanged?.Invoke(); next.Tab.Focus();
                _tabs.GetFirstAncestorOfType<ScrollView>()?.ScrollTo(next.Tab);
            }
            return true;
        }

        public void NotifyOpened()
        {
            if (IsOpen) return;
            IsOpen = true; _pages.Find(p => p.Id == SelectedPageId)?.Shown?.Invoke();
        }

        public void NotifyClosed()
        {
            if (!IsOpen) return;
            IsOpen = false; _pages.Find(p => p.Id == SelectedPageId)?.Hidden?.Invoke();
        }

        private void Close() { if (_receivesInput()) _onClose(); }
        private void OnBackdropClicked(ClickEvent evt) => Close();
        private void OnTabKey(KeyDownEvent evt)
        {
            if (!_receivesInput()) return;
            var delta = evt.keyCode == KeyCode.RightArrow ? 1 : evt.keyCode == KeyCode.LeftArrow ? -1 : 0;
            if (delta == 0 || _pages.Count < 2) return;
            var focused = _pages.FindIndex(p => ReferenceEquals(p.Tab, evt.target));
            if (focused < 0) return;
            SelectPage(_pages[(focused + delta + _pages.Count) % _pages.Count].Id);
            evt.StopPropagation();
        }

        public void Dispose()
        {
            NotifyClosed();
            _close.clicked -= Close;
            _backdrop.UnregisterCallback<ClickEvent>(OnBackdropClicked);
            _tabs.UnregisterCallback<KeyDownEvent>(OnTabKey);
            _tabs.Clear(); _content.Clear(); _pages.Clear(); SelectedPageId = null;
        }
    }
}
