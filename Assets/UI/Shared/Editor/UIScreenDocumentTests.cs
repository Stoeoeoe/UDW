using TestConfiguration = Core.Common.Editor.ConfigurationTestData;
using System.Reflection;
using System.Collections;
using Character;
using Core.Equipment;
using Core.Dialogue.Vulcanus;
using Core.Events;
using Core.Inventory;
using Interaction.Tools;
using MoreMountains.Tools;
using NUnit.Framework;
using UI.InventoryScreen;
using UI.Shops;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;

namespace UI.Shared.Editor
{
    [Category("UIScreen")]
    public sealed class UIScreenDocumentTests : IEventListener<ItemSelectedEvent>
    {
        private GameObject _root;
        private Core.Common.Editor.GameTestFixture _fixture;
        private GameObject _screenRoot;
        private UrGUIManager _manager;
        private UIDocument _document;
        private SlotInventory _inventory;
        private ToolData _tool;
        private int _selectionEvents;
        private ItemSelectedEvent _selected;

        [SetUp]
        public void SetUp()
        {
            Assert.That(UrGUIManager.Instance, Is.Null, "Run outside a game session.");
            _selectionEvents = 0;
            _selected = default;
            _fixture = new Core.Common.Editor.GameTestFixture("UI document tests");
            _root = _fixture.Root;
            _root.SetActive(true);
            UIScreenPauseTests.CreateScreenServices(_fixture);
            _manager = _fixture.AddSingleton<UrGUIManager>(manager => manager.gameObject.SetActive(true));
            var inventoryRoot = new GameObject("Test inventory");
            inventoryRoot.transform.SetParent(_root.transform);
            inventoryRoot.SetActive(false);
            _inventory = inventoryRoot.AddComponent<SlotInventory>();
            _inventory.Bind(new InventoryState { Slots = new InventorySlotState[2] });
            _tool = ScriptableObject.CreateInstance<ToolData>();
            Set(typeof(ItemDefinition), _tool, "_itemId", "test:tool");
            Set(typeof(ItemDefinition), _tool, "_itemName", "Test tool");
            Set(typeof(ItemDefinition), _tool, "_maxStackSize", 1);
            _inventory.AddItem(_tool, 1);
            _inventory.Loadout.SelectItem(-1);
            EventBus<ItemSelectedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<ItemSelectedEvent>.Unsubscribe(this);
            if (_screenRoot)
            {
                var screen = _screenRoot.GetComponent<ManagedUIScreen>();
                if (screen) typeof(ManagedUIScreen).GetMethod("OnDisable", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(screen, null);
            }
            _manager?.CloseAll();
            var dialogueRunner = _root.GetComponentInChildren<VulcanusDialogueRunner>(true);
            if (dialogueRunner)
            {
                UIScreenPauseTests.Invoke(dialogueRunner, "OnDisable");
                UIScreenPauseTests.Invoke(dialogueRunner, "OnDestroy");
            }
            _fixture?.Dispose();
            Object.DestroyImmediate(_tool);
        }

        [UnityTest]
        public IEnumerator ClosedInventoryLayoutLetsWorldClicksThrough()
        {
            var window = ScriptableObject.CreateInstance<EditorWindow>();
            try
            {
                window.position = new Rect(0, 0, 800, 600);
                window.rootVisualElement.pickingMode = PickingMode.Ignore;
                var layout = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/InventoryScreen/InventoryScreen.uxml").CloneTree();
                layout.pickingMode = PickingMode.Ignore;
                layout.style.flexGrow = 1;
                window.rootVisualElement.Add(layout);
                window.Show();
                yield return null;
                yield return null;
                var host = layout.Q(className: "game-menu-host");
                Assert.That(host.worldBound.width, Is.GreaterThan(0));
                var point = host.worldBound.center;
                var picked = window.rootVisualElement.panel.Pick(point);
                // The Editor's dock can still be picked outside our runtime layout.
                Assert.That(picked == null || !layout.Contains(picked), Is.True,
                    "A closed menu must not make EventSystem consider the world pointer to be over UI.");

                layout.Q("menuOverlay").style.display = DisplayStyle.Flex;
                yield return null;
                yield return null;
                Assert.That(layout.Contains(window.rootVisualElement.panel.Pick(point)), Is.True,
                    "Opening the menu must still intercept clicks.");
            }
            finally { window.Close(); Object.DestroyImmediate(window); }
        }

        [Test]
        public void InventoryEventBurstRefreshesTheViewOnceAtTheEndOfTheFrame()
        {
            var presenter = CreateInventoryScreen();
            presenter.OpenInventory();
            var cell = _document.rootVisualElement.Q("slot0");
            var originalIcon = cell[0];
            Assert.That(_inventory.Interaction.TryPickUp(0, 1), Is.True);
            Assert.That(_inventory.Interaction.TryReturnHeld(), Is.True);
            Assert.That(cell[0], Is.SameAs(originalIcon));
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell[0], Is.Not.SameAs(originalIcon));
            var refreshedIcon = cell[0];
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell[0], Is.SameAs(refreshedIcon));
        }

        [Test]
        public void InventorySlotShowsQuantityAndColouredChargeAndRefreshesAfterConsumption()
        {
            Set(typeof(ItemDefinition), _tool, "_maxStackSize", 99);
            Set(typeof(ToolData), _tool, "_maxCharge", 20);
            Set(typeof(ToolData), _tool, "_chargeColor", Color.red);
            _inventory.SetSlot(0, new ItemStack(_tool, 7));
            var presenter = CreateInventoryScreen(); presenter.OpenInventory();
            var root = _document.rootVisualElement;
            var cell = root.Q("slot0");
            Assert.That(cell.Q<Label>(className: "inventory-quantity").text, Is.EqualTo("7"));
            Assert.That(cell.Q("chargeFill").style.width.value.value, Is.EqualTo(100f));
            Assert.That(cell.Q("chargeFill").style.backgroundColor.value, Is.EqualTo(Color.red));
            var charge = _inventory.Loadout.GetToolCharge(_tool);
            charge.TryConsume(5);
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell.Q("chargeFill").style.width.value.value, Is.EqualTo(75f));
            Assert.That(cell.Q("chargeTrack").tooltip, Is.EqualTo("15 / 20"));
            charge.IncreaseCapacity(20);
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell.Q("chargeFill").style.width.value.value, Is.EqualTo(37.5f));
            charge.Refill();
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell.Q("chargeFill").style.width.value.value, Is.EqualTo(100f));
            charge.TryConsume(40);
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell.Q("chargeFill").style.width.value.value, Is.Zero);
            Assert.That(cell.Q<Label>(className: "inventory-quantity").text, Is.EqualTo("7"));
            _inventory.SetSlot(0, ItemStack.Empty);
            UIScreenPauseTests.Invoke(presenter, "LateUpdate");
            Assert.That(cell.Q("chargeTrack"), Is.Null);
            Assert.That(cell.Q<Label>(className: "inventory-quantity"), Is.Null);
        }

        [Test]
        public void HotbarUsesCarriedQuantityAndRefreshesChargeWithoutPolling()
        {
            Set(typeof(ItemDefinition), _tool, "_maxStackSize", 99);
            Set(typeof(ToolData), _tool, "_maxCharge", 20);
            Set(typeof(ToolData), _tool, "_chargeColor", Color.red);
            _inventory.SetSlot(0, new ItemStack(_tool, 3));
            _inventory.SetSlot(1, new ItemStack(_tool, 4));
            _inventory.Loadout.AssignToolbeltSlot(0, 0);
            var owner = new GameObject("Hotbar"); owner.SetActive(false); owner.transform.SetParent(_root.transform);
            var bar = owner.AddComponent<UI.Hotbar.ToolHotbar>();
            bar.TargetInventoryName = _inventory.InventoryName;
            bar.PlayerId = _inventory.PlayerID;
            Set(typeof(UI.Hotbar.ToolHotbar), bar, "_targetInventory", _inventory);
            bar.SlotContainer = owner.transform;
            bar.SlotPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/UI/Hotbar/ToolHotbarSlot.prefab");
            UIScreenPauseTests.Invoke(bar, "Start");
            UIScreenPauseTests.Invoke(bar, "OnEnable");
            try
            {
                var slot = owner.transform.GetChild(0).GetComponent<UI.Hotbar.HotbarSlot>();
                Assert.That(slot.QuantityText.text, Is.EqualTo("7"));
                Assert.That(slot.ChargeTrack.gameObject.activeSelf, Is.True);
                Assert.That(slot.ChargeFill.rectTransform.anchorMax.x, Is.EqualTo(1f));
                Assert.That(slot.ChargeFill.color, Is.EqualTo(Color.red));
                var charge = _inventory.Loadout.GetToolCharge(_tool);
                charge.TryConsume(5);
                Assert.That(slot.ChargeFill.rectTransform.anchorMax.x, Is.EqualTo(0.75f));
                charge.IncreaseCapacity(20);
                Assert.That(slot.ChargeFill.rectTransform.anchorMax.x, Is.EqualTo(0.375f));
                charge.Refill();
                Assert.That(slot.ChargeFill.rectTransform.anchorMax.x, Is.EqualTo(1f));
                charge.TryConsume(40);
                Assert.That(slot.ChargeFill.rectTransform.anchorMax.x, Is.Zero);
                _inventory.SetSlot(0, ItemStack.Empty);
                Assert.That(slot.QuantityText.text, Is.EqualTo("4"));
                _inventory.SetSlot(1, ItemStack.Empty);
                Assert.That(slot.ChargeTrack.gameObject.activeSelf, Is.False);
                Assert.That(slot.QuantityText.enabled, Is.False);
            }
            finally { UIScreenPauseTests.Invoke(bar, "OnDisable"); }
        }

        [Test]
        public void SwitchingTabsReturnsCarriedItemsAndReopeningStartsOnBag()
        {
            var presenter = CreateInventoryScreen(); presenter.OpenInventory();
            Assert.That(_inventory.Interaction.TryPickUp(0, 1), Is.True);
            Submit(_document.rootVisualElement.Q<Button>("equipmentTab"));
            Assert.That(_inventory.HeldStack.IsOccupied, Is.False);
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_tool));
            Assert.That(_document.rootVisualElement.Q("bagPage").style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(_document.rootVisualElement.Q("equipmentPage").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(_document.rootVisualElement.Q("upgradeButton"), Is.Null);
            _document.visualTreeAsset = _document.visualTreeAsset;
            presenter.RefreshAllSlots();
            Assert.That(_document.rootVisualElement.Q("equipmentPage").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Submit(_document.rootVisualElement.Q<Button>("worldTab"));
            Assert.That(_document.rootVisualElement.Q("worldPage").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            presenter.CloseInventory(); presenter.OpenInventory();
            Assert.That(_document.rootVisualElement.Q("bagPage").style.display.value, Is.EqualTo(DisplayStyle.Flex));
        }

        [Test]
        public void SwitchingTabsKeepsAnUnreturnableStackVisibleInTheBag()
        {
            var presenter = CreateInventoryScreen(); presenter.OpenInventory();
            Assert.That(_inventory.Interaction.TryPickUp(0, 1), Is.True);
            Assert.That(_inventory.AddItem(_tool, 2), Is.True);
            Submit(_document.rootVisualElement.Q<Button>("equipmentTab"));
            Assert.That(_inventory.HeldStack.Item, Is.SameAs(_tool));
            Assert.That(_document.rootVisualElement.Q("bagPage").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(_document.rootVisualElement.Q("heldCursor").style.display.value, Is.EqualTo(DisplayStyle.Flex));
        }

        [Test]
        public void PlainClickInspectsASingleToolWithoutMovingItAndHandSelectionIsExplicit()
        {
            var presenter = CreateInventoryScreen();
            presenter.OpenInventory();
            var slot = _document.rootVisualElement.Q<VisualElement>("slot0");
            using (var click = PointerDownEvent.GetPooled(new Event
                   { type = EventType.MouseDown, button = 0 }))
                Send(slot, click);
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_tool));
            Assert.That(_inventory.HeldStack.IsOccupied, Is.False);
            Assert.That(_document.rootVisualElement.Q<Button>("useButton").enabledSelf, Is.True);
            Submit(_document.rootVisualElement.Q<Button>("useButton"));
            Assert.That(_selectionEvents, Is.EqualTo(1));
            Assert.That(_selected.HeldItem, Is.SameAs(_tool));
            Assert.That(_selected.InventorySlotIndex, Is.Zero);
        }

        [Test]
        public void InventoryControlsPlayOneCueEachAfterDocumentReplacement()
        {
            _manager.SoundProfile = AssetDatabase.LoadAssetAtPath<UISoundProfile>("Assets/UI/Shared/DefaultUISounds.asset");
            Assert.That(_manager.SoundProfile, Is.Not.Null);
            var played = new System.Collections.Generic.List<AudioClip>();
            AudioSource Capture(AudioClip clip, MMSoundManagerPlayOptions options) { played.Add(clip); return null; }
            MMSoundManagerSoundPlayEvent.Register(Capture);
            try
            {
                var presenter = CreateInventoryScreen();
                presenter.OpenInventory();
                Assert.That(played.Count, Is.EqualTo(1));
                _document.visualTreeAsset = _document.visualTreeAsset;
                presenter.RefreshAllSlots();
                Assert.That(played.Count, Is.EqualTo(1), "Rebinding a visible screen must stay silent.");
                var slot = _document.rootVisualElement.Q<VisualElement>("slot0");
                using (var click = PointerDownEvent.GetPooled(new Event
                       { type = EventType.MouseDown, button = 0, modifiers = EventModifiers.Shift }))
                    Send(slot, click);
                Assert.That(played.Count, Is.EqualTo(2));
                Submit(_document.rootVisualElement.Q<Button>("useButton"));
                Assert.That(played.Count, Is.EqualTo(3));
                Submit(_document.rootVisualElement.Q<Button>("closeButton"));
                Assert.That(played.Count, Is.EqualTo(4));
                var cues = new[] { UISoundCue.Open, UISoundCue.Click, UISoundCue.Click, UISoundCue.Close };
                for (var i = 0; i < cues.Length; i++)
                {
                    Assert.That(_manager.SoundProfile.TryGet(cues[i], out var cue), Is.True);
                    Assert.That(played[i], Is.SameAs(cue.clips[0]));
                }
            }
            finally { MMSoundManagerSoundPlayEvent.Unregister(Capture); }
        }

        [Test]
        public void KeyboardSelectionLeavesTheToolInItsSlot()
        {
            var presenter = CreateInventoryScreen();
            presenter.OpenInventory();
            var slot = _document.rootVisualElement.Q<VisualElement>("slot0");
            using (var key = KeyDownEvent.GetPooled('\n', KeyCode.Return, EventModifiers.None)) Send(slot, key);
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_tool));
            Assert.That(_inventory.HeldStack.IsOccupied, Is.False);
            Assert.That(_document.rootVisualElement.Q<Button>("useButton").enabledSelf, Is.True);
        }

        [Test]
        public void InventoryReactivationAndDocumentReplacementBindButtonsExactlyOnce()
        {
            var presenter = CreateInventoryScreen();
            for (var i = 0; i < 2; i++)
            {
                _inventory.Loadout.SelectItem(-1); _selectionEvents = i;
                var oldRoot = _document.rootVisualElement;
                UIScreenPauseTests.Invoke(presenter, "OnDisable");
                _screenRoot.SetActive(false);
                _screenRoot.SetActive(true);
                UIScreenPauseTests.Invoke(presenter, "OnEnable");
                Assert.That(_document.rootVisualElement, Is.Not.SameAs(oldRoot));
                presenter.OpenInventory();
                presenter.SelectSlot(0);
                Submit(_document.rootVisualElement.Q<Button>("useButton"));
                Assert.That(_selectionEvents, Is.EqualTo(i + 1));
                Submit(_document.rootVisualElement.Q<Button>("closeButton"));
                Assert.That(presenter.IsOpen, Is.False);
                Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            }
            presenter.OpenInventory();
            _inventory.Loadout.SelectItem(-1); _selectionEvents = 2;
            var previousRoot = _document.rootVisualElement;
            _document.visualTreeAsset = _document.visualTreeAsset;
            presenter.RefreshAllSlots();
            Assert.That(_document.rootVisualElement, Is.Not.SameAs(previousRoot));
            Assert.That(_document.rootVisualElement.Q("menuOverlay").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            presenter.SelectSlot(0);
            Submit(_document.rootVisualElement.Q<Button>("useButton"));
            Assert.That(_selectionEvents, Is.EqualTo(3));
            Assert.That(_document.rootVisualElement.Q<Button>("discardButton").enabledSelf, Is.True,
                "A droppable item exposes its drop action after rebinding.");
            Assert.That(_inventory.GetSlot(0).IsOccupied, Is.True);
        }

        [Test]
        public void ClosingTheTopModalRestoresTheUnderlyingFocusedControl()
        {
            var presenter = CreateInventoryScreen();
            var firstDocument = _document;
            presenter.OpenInventory();
            presenter.SelectSlot(0);
            var button = firstDocument.rootVisualElement.Q<Button>("useButton");
            button.Focus();
            CreateDocument("Assets/UI/InventoryScreen/InventoryScreen.uxml");
            var overlay = _document.rootVisualElement.Q("menuOverlay");
            var popup = _screenRoot.AddComponent<PauseTestScreen>();
            popup.OpenElement(overlay);
            Assert.That(firstDocument.rootVisualElement.Q("menuOverlay").enabledSelf, Is.False);
            popup.Close();
            Assert.That(firstDocument.rootVisualElement.panel.focusController.focusedElement, Is.SameAs(button));
        }

        [Test]
        public void RememberedFocusCannotFollowAControlReparentedToAnotherScreen()
        {
            var presenter = CreateInventoryScreen();
            var firstDocument = _document;
            presenter.OpenInventory();
            presenter.SelectSlot(0);
            var button = firstDocument.rootVisualElement.Q<Button>("useButton");
            button.Focus();
            CreateDocument("Assets/UI/InventoryScreen/InventoryScreen.uxml");
            var overlay = _document.rootVisualElement.Q("menuOverlay");
            var popup = _screenRoot.AddComponent<PauseTestScreen>();
            popup.OpenElement(overlay);
            overlay.Add(button);
            popup.Close();
            var originalOverlay = firstDocument.rootVisualElement.Q("menuOverlay");
            Assert.That(firstDocument.rootVisualElement.panel.focusController.focusedElement, Is.SameAs(originalOverlay));
        }

        [Test]
        public void TopModalOwnsSubmitAndDocumentRebindingDoesNotStealPriority()
        {
            var presenter = CreateInventoryScreen();
            var firstDocument = _document;
            firstDocument.sortingOrder = 20;
            presenter.OpenInventory(); presenter.SelectSlot(0);
            CreateDocument("Assets/UI/InventoryScreen/InventoryScreen.uxml");
            var secondDocument = _document;
            secondDocument.sortingOrder = 0;
            var second = _screenRoot.AddComponent<PauseTestScreen>();
            second.OpenElement(secondDocument.rootVisualElement.Q("menuOverlay"));
            Assert.That(secondDocument.sortingOrder, Is.GreaterThan(firstDocument.sortingOrder));
            Submit(firstDocument.rootVisualElement.Q<Button>("useButton"));
            Assert.That(_selectionEvents, Is.Zero);
            firstDocument.visualTreeAsset = firstDocument.visualTreeAsset;
            presenter.RefreshAllSlots();
            Assert.That(_manager.IsTopScreen(second), Is.True);
            second.Close();
            Assert.That(secondDocument.sortingOrder, Is.Zero);
            Submit(firstDocument.rootVisualElement.Q<Button>("useButton"));
            Assert.That(_selectionEvents, Is.EqualTo(1));
            presenter.CloseInventory();
            Assert.That(firstDocument.sortingOrder, Is.EqualTo(20));
        }

        [Test]
        public void ControllerSubmitInspectsAndCancelDismissesAnInlineSplitBeforeTheScreen()
        {
            Set(typeof(ItemDefinition), _tool, "_maxStackSize", 99);
            _inventory.AddItem(_tool, 1);
            var presenter = CreateInventoryScreen(); presenter.OpenInventory();
            using (var evt = NavigationSubmitEvent.GetPooled()) Send(_document.rootVisualElement.Q("slot0"), evt);
            Assert.That(_selectionEvents, Is.Zero, "Inspecting a focused slot must not equip it.");
            Assert.That(_document.rootVisualElement.Q<Label>("selectionLabel").text, Is.EqualTo("Test tool"));
            Assert.That(_document.rootVisualElement.Q("actionsButton"), Is.Null);
            Submit(_document.rootVisualElement.Q<Button>("splitButton"));
            Assert.That(_document.rootVisualElement.Q("contextMenu").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            using (var evt = NavigationCancelEvent.GetPooled()) Send(_document.rootVisualElement.Q("menuOverlay"), evt);
            Assert.That(presenter.IsOpen, Is.True);
            Assert.That(_document.rootVisualElement.Q("contextMenu").style.display.value, Is.EqualTo(DisplayStyle.None));
            using (var evt = NavigationCancelEvent.GetPooled()) Send(_document.rootVisualElement.Q("menuOverlay"), evt);
            Assert.That(presenter.IsOpen, Is.False);
        }

        [Test]
        public void ManagerClosureResetsTheInventoryToggleState()
        {
            var presenter = CreateInventoryScreen();
            presenter.OpenInventory();
            _manager.OnLocationLeave(null);
            Assert.That(presenter.IsOpen, Is.False);
            presenter.ToggleInventory();
            Assert.That(presenter.IsOpen, Is.True);
        }

        [Test]
        public void ShopReactivationUsesTheNewTreesCloseButton()
        {
            CreateDocument("Assets/UI/Shop/ShopScreen.uxml");
            var presenter = _screenRoot.AddComponent<ShopUIDocumentPresenter>();
            UIScreenPauseTests.Invoke(presenter, "Awake");
            UIScreenPauseTests.Invoke(presenter, "OnEnable");
            var oldRoot = _document.rootVisualElement;
            UIScreenPauseTests.Invoke(presenter, "OnDisable");
            _screenRoot.SetActive(false);
            _screenRoot.SetActive(true);
            UIScreenPauseTests.Invoke(presenter, "OnEnable");
            Assert.That(_document.rootVisualElement, Is.Not.SameAs(oldRoot));
            var overlay = _document.rootVisualElement.Q("shopOverlay");
            typeof(ManagedUIScreen).GetMethod("OpenScreen", BindingFlags.Instance | BindingFlags.NonPublic,
                null, new[] { typeof(GameCharacter), typeof(ScreenPauseMode?) }, null)
                .Invoke(presenter, new object[] { null, ScreenPauseMode.GameClock });
            Assert.That(_manager.IsOpen(presenter), Is.True);
            Submit(_document.rootVisualElement.Q<Button>("closeButton"));
            Assert.That(_manager.IsOpen(presenter), Is.False);
            Assert.That(overlay.style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        private UrInventoryUIDocumentPresenter CreateInventoryScreen()
        {
            CreateDocument("Assets/UI/InventoryScreen/InventoryScreen.uxml");
            var presenter = _screenRoot.AddComponent<UrInventoryUIDocumentPresenter>();
            Set(typeof(InventoryScreenView), presenter, "_targetInventory", _inventory);
            Assert.That(presenter, Is.Not.InstanceOf<UrInventoryDisplay>());
            Assert.That(_screenRoot.GetComponent<CanvasGroup>(), Is.Null);
            UIScreenPauseTests.Invoke(presenter, "Awake");
            UIScreenPauseTests.Invoke(presenter, "OnEnable");
            return presenter;
        }

        [Test]
        public void EssentialItemsHaveNoDropActionAndAnAlreadyHeldToolShowsItsState()
        {
            Set(typeof(ItemDefinition), _tool, "_preventDropping", true);
            var presenter = CreateInventoryScreen(); presenter.OpenInventory(); presenter.SelectSlot(0);
            Assert.That(_document.rootVisualElement.Q<Button>("discardButton").style.display.value, Is.EqualTo(DisplayStyle.None));
            Submit(_document.rootVisualElement.Q<Button>("useButton"));
            Assert.That(_document.rootVisualElement.Q<Button>("useButton").text, Is.EqualTo("In hand"));
            Assert.That(_document.rootVisualElement.Q<Button>("useButton").enabledSelf, Is.False);
            Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(_tool));
        }

        [Test]
        public void ToolbeltAssignmentKeepsTheBagStackAndCapacityUnchanged()
        {
            var config = ScriptableObject.CreateInstance<InventoryConfiguration>(); TestConfiguration.Set(config, "Columns", 2); TestConfiguration.Set(config, "StartingRows", 2);
            try
            {
                _inventory.Configuration = config;
                _inventory.Bind(new InventoryState { Slots = new InventorySlotState[4] });
                _inventory.SetSlot(2, new ItemStack(_tool, 1));
                var presenter = CreateInventoryScreen(); presenter.OpenInventory(); presenter.SelectSlot(2);
                Submit(_document.rootVisualElement.Q<Button>("beltButton"));
                Assert.That(_document.rootVisualElement.Q<Button>("quickChoice0").text, Is.EqualTo("1: Empty"));
                Submit(_document.rootVisualElement.Q<Button>("quickChoice0"));
                Assert.That(_inventory.GetSlot(0).IsOccupied, Is.False);
                Assert.That(_inventory.GetSlot(2).Item, Is.SameAs(_tool));
                Assert.That(_inventory.Capacity, Is.EqualTo(4));
                Assert.That(_inventory.Loadout.GetToolbeltTool(0), Is.SameAs(_tool));
                _inventory.Loadout.SelectToolbeltSlot(0);
                Assert.That(_inventory.Loadout.ActiveHandItem, Is.SameAs(_tool));
                Assert.That(_inventory.HeldStack.IsOccupied, Is.False);
                Assert.That(_document.rootVisualElement.Q("quickChoices").style.display.value, Is.EqualTo(DisplayStyle.None));
            }
            finally { Object.DestroyImmediate(config); }
        }

        [Test]
        public void EquipmentChoicesMatchTheSelectedSlotAndChangingGearKeepsItemsOwned()
        {
            var head = ScriptableObject.CreateInstance<EquipmentSlotDefinition>(); TestConfiguration.Set(head, "Id", "test:head"); TestConfiguration.Set(head, "Label", "Head");
            var feet = ScriptableObject.CreateInstance<EquipmentSlotDefinition>(); TestConfiguration.Set(feet, "Id", "test:feet"); TestConfiguration.Set(feet, "Label", "Feet");
            var config = ScriptableObject.CreateInstance<InventoryConfiguration>(); TestConfiguration.Set(config, "EquipmentSlots", new[] { head, feet });
            var hat = ScriptableObject.CreateInstance<WornEquipmentItem>(); var boots = ScriptableObject.CreateInstance<WornEquipmentItem>();
            try
            {
                Set(typeof(ItemDefinition), hat, "_itemId", "test:hat");
                Set(typeof(ItemDefinition), hat, "_itemName", "Hat"); TestConfiguration.Set(hat, "AllowedSlots", new[] { head });
                Set(typeof(ItemDefinition), boots, "_itemId", "test:boots");
                Set(typeof(ItemDefinition), boots, "_itemName", "Boots"); TestConfiguration.Set(boots, "AllowedSlots", new[] { feet });
                _inventory.Configuration = config;
                _inventory.SetSlot(0, new ItemStack(hat, 1)); _inventory.SetSlot(1, new ItemStack(boots, 1));
                var presenter = CreateInventoryScreen(); presenter.OpenInventory(); presenter.Menu.SelectPage("equipment");
                Submit(_document.rootVisualElement.Q<Button>("equipmentSlot_test:head"));
                Assert.That(_document.rootVisualElement.Q<Button>("wearItem0"), Is.Not.Null);
                Assert.That(_document.rootVisualElement.Q<Button>("wearItem1"), Is.Null);
                Submit(_document.rootVisualElement.Q<Button>("wearItem0"));
                Assert.That(_inventory.Loadout.GetEquipment(head.Id).Item, Is.SameAs(hat));
                Assert.That(_document.rootVisualElement.Q<Label>("equipmentStatus").text, Is.EqualTo($"Now wearing {hat.ItemName}."));
                Assert.That(_inventory.GetSlot(1).Item, Is.SameAs(boots));
                Submit(_document.rootVisualElement.Q<Button>("unequipButton"));
                Assert.That(_inventory.Loadout.GetEquipment(head.Id).IsOccupied, Is.False);
                Assert.That(_inventory.GetSlot(0).Item, Is.SameAs(hat));
            }
            finally { Object.DestroyImmediate(hat); Object.DestroyImmediate(boots); Object.DestroyImmediate(config); Object.DestroyImmediate(head); Object.DestroyImmediate(feet); }
        }

        [Test]
        public void ContainerScreenTransfersBothWaysAndReleasesItsModalPauseOnClose()
        {
            var character = _fixture.CreateCharacter("Chest owner");
            character.MainInventory.AddItem(_tool, 1);
            var holder = new GameObject("Inactive chest staging");
            holder.SetActive(false);
            holder.transform.SetParent(_root.transform);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Content/Spawnables/Chest.prefab");
            var chest = Object.Instantiate(prefab, holder.transform).GetComponent<PersistentContainer>();
            typeof(Core.Spawning.SpawnedObject).GetMethod("Bind", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(chest, new object[] { null, "test-chest", chest.CreateState() });
            holder.SetActive(true);
            CreateDocument("Assets/UI/Containers/ContainerScreen.uxml");
            var screen = _screenRoot.AddComponent<UI.Containers.ContainerScreen>();
            Set(typeof(UI.Containers.ContainerScreen), screen, "document", _document);
            UIScreenPauseTests.Invoke(screen, "Awake");
            screen.Open(chest, character);
            Assert.That(UrGUIManager.IsCharacterPaused(character), Is.True);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            Submit(_document.rootVisualElement.Q("bagGrid").Q<Button>());
            Assert.That(character.MainInventory.GetSlot(0).IsEmpty, Is.True);
            Assert.That(chest.Storage.Inventory.GetSlot(0).Item, Is.SameAs(_tool));
            UIScreenPauseTests.Invoke(screen, "LateUpdate");
            Submit(_document.rootVisualElement.Q("containerGrid").Q<Button>());
            Assert.That(chest.Storage.Inventory.GetSlot(0).IsEmpty, Is.True);
            Assert.That(character.MainInventory.GetSlot(0).Item, Is.SameAs(_tool));
            Submit(_document.rootVisualElement.Q<Button>("closeContainer"));
            Assert.That(UrGUIManager.IsCharacterPaused(character), Is.False);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            Assert.That(_manager.IsOpen(screen), Is.False);
        }

        [Test]
        public void DialogueUsesTheScreenPolicyOrAnOpeningOverrideAfterReactivation()
        {
            var runnerRoot = new GameObject("Dialogue runner");
            runnerRoot.transform.SetParent(_root.transform);
            var runner = runnerRoot.AddComponent<VulcanusDialogueRunner>();
            CreateDocument(AssetDatabase.GUIDToAssetPath("63af131c2305b2949b9a347cc475d06a"));
            var presenter = _screenRoot.AddComponent<VulcanusDialogueUIDocumentPresenter>();
            Set(typeof(VulcanusDialogueUIDocumentPresenter), presenter, "layoutAsset", _document.visualTreeAsset);
            Set(typeof(VulcanusDialogueUIDocumentPresenter), presenter, "styleSheet",
                AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/UI/Dialogue/Vulcanus/VulcanusDialogueRuntime.uss"));
            var database = _fixture.Own(ScriptableObject.CreateInstance<VulcanusDialogueDatabase>());
            database.Configure(null, System.Array.Empty<VulcanusDialogueAsset>());
            Set(typeof(VulcanusDialogueRunner), runner, "database", database);
            Set(typeof(VulcanusDialogueRunner), runner, "presenter", presenter);
            UIScreenPauseTests.Invoke(runner, "Awake");
            UIScreenPauseTests.Invoke(presenter, "Awake");
            presenter.PauseWhileOpen = ScreenPauseMode.None;
            var context = new VulcanusDialogueExecutionContext();
            presenter.OnDialogueStarted(context);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
            presenter.OnDialogueFinished(context);
            var oldRoot = _document.rootVisualElement;
            typeof(ManagedUIScreen).GetMethod("OnDisable", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(presenter, null);
            _screenRoot.SetActive(false);
            _screenRoot.SetActive(true);
            UIScreenPauseTests.Invoke(presenter, "OnEnable");
            typeof(VulcanusDialogueExecutionContext).GetProperty("PauseWhileOpen").SetValue(context, ScreenPauseMode.GameClock);
            presenter.OnDialogueStarted(context);
            Assert.That(_document.rootVisualElement, Is.Not.SameAs(oldRoot));
            Assert.That(_document.rootVisualElement.Q("dialogue-overlay").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(UrGUIManager.IsGameClockPaused, Is.True);
            presenter.OnDialogueFinished(context);
            Assert.That(UrGUIManager.IsGameClockPaused, Is.False);
        }

        private void CreateDocument(string layout)
        {
            _screenRoot = new GameObject("Test screen");
            _screenRoot.transform.SetParent(_root.transform);
            _document = _screenRoot.AddComponent<UIDocument>();
            var panelPath = AssetDatabase.GUIDToAssetPath("354d3ceb169652343b4d5165d106bca7");
            _document.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>(panelPath);
            Assert.That(_document.panelSettings, Is.Not.Null);
            _document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(layout);
            Assert.That(_document.visualTreeAsset, Is.Not.Null);
        }

        private static void Submit(Button button)
        {
            using (var evt = NavigationSubmitEvent.GetPooled()) Send(button, evt);
        }

        private static void Send(VisualElement target, EventBase evt)
        {
            evt.target = target;
            target.SendEvent(evt);
            // A submitted command is followed by the same refresh pass as a runtime frame.
            foreach (var presenter in Object.FindObjectsByType<UrInventoryUIDocumentPresenter>(FindObjectsSortMode.None))
                typeof(InventoryScreenView).GetMethod("LateUpdate", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(presenter, null);
        }

        private static void Set(System.Type type, object target, string field, object value) =>
            type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);

        public void OnEvent(ItemSelectedEvent selection)
        {
            _selectionEvents++;
            _selected = selection;
        }
    }
}
