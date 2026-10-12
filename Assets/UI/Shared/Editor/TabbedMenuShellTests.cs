using NUnit.Framework;
using UnityEngine.UIElements;

namespace UI.Shared.Editor
{
    [Category("UIScreen")]
    public sealed class TabbedMenuShellTests
    {
        private static VisualElement CreateShell()
        {
            var root = new VisualElement();
            root.Add(new VisualElement { name = "menuOverlay" });
            root.Add(new VisualElement { name = "menuBackdrop" });
            root.Add(new VisualElement { name = "menuTabs" });
            root.Add(new VisualElement { name = "menuContent" });
            root.Add(new Label { name = "screenTitle" });
            root.Add(new Button { name = "closeButton" });
            return root;
        }

        [Test]
        public void ArbitraryPagesJoinTheShellAndReceiveLifecycleCallbacks()
        {
            var root = CreateShell(); var shown = 0; var hidden = 0;
            using var menu = new TabbedMenuShell(root, () => true, null, null, () => { });
            var journal = new VisualElement(); var skills = new VisualElement();
            menu.RegisterPage("journal", "Journal", journal, shown: () => shown++, hidden: () => hidden++);
            menu.RegisterPage("skills", "Skills", skills);
            Assert.That(menu.SelectPage("journal"), Is.True);
            menu.NotifyOpened();
            Assert.That(shown, Is.EqualTo(1));
            Assert.That(menu.SelectPage("skills"), Is.True);
            Assert.That(hidden, Is.EqualTo(1));
            Assert.That(journal.style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(skills.style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(root.Q<Label>("screenTitle").text, Is.EqualTo("Skills"));
            Assert.That(root.Q<Button>("skillsTab").ClassListContains("menu-tab-active"), Is.True);
            Assert.That(menu.SelectPage("missing"), Is.False);
            menu.NotifyClosed();
            Assert.That(menu.IsOpen, Is.False);
        }

        [Test]
        public void PageCanBlockLeavingAndCoveredMenusIgnoreNavigation()
        {
            var acceptsInput = true; var canLeave = false; var root = CreateShell();
            using var menu = new TabbedMenuShell(root, () => acceptsInput, null, null, () => { });
            menu.RegisterPage("first", "First", new VisualElement(), () => canLeave);
            menu.RegisterPage("next", "Next", new VisualElement());
            menu.SelectPage("first", false);
            Assert.That(menu.SelectPage("next"), Is.False);
            Assert.That(menu.SelectedPageId, Is.EqualTo("first"));
            canLeave = true; acceptsInput = false;
            Assert.That(menu.SelectPage("next"), Is.False);
            acceptsInput = true;
            Assert.That(menu.SelectPage("next"), Is.True);
        }
    }
}
