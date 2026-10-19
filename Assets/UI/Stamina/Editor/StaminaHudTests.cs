using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Character;
using Core.Common.Editor;
using Core.Context;
using Core.Game;
using Interaction;
using Interaction.Tools;
using UnityEngine.UIElements;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace UI.Stamina.Editor
{
    /// <summary>Checks real tool dispatch and the authored stamina bar against the same live player resource.</summary>
    public sealed class StaminaHudTests
    {
        private GameTestFixture _fixture;
        private MainCharacter _character;
        private ToolData _tool;
        private UseToolAction _useTool;
        private StaminaTestToolAction _toolAction;
        private StaminaHudPresenter _presenter;
        private ProgressBar _meter;
        private Label _value;

        [SetUp]
        public void SetUp()
        {
            _fixture = new GameTestFixture("Tool stamina and HUD");
            _fixture.AddSingleton<GameStateManager>();
            _fixture.AddSingleton<CharacterManager>();
            _fixture.AddSingleton<Core.PlayerStateManager>();
            GameState.Time.daysSinceStart = 1;
            GameState.Player.Home = new PlayerHomeState("test:home", "test-bed");
            _character = _fixture.CreateCharacter();
            _tool = _fixture.Own(Object.Instantiate(AssetDatabase.LoadAssetAtPath<ToolData>("Assets/Resources/Items/Tools/HoeToolData.asset")));
            Set(_tool, "_showTileHighlighterOnPrepare", false);
            var template = new GameObject("Test tool action");
            template.transform.SetParent(_fixture.Root.transform);
            var action = template.AddComponent<StaminaTestToolAction>();
            typeof(ToolAction).GetProperty(nameof(ToolAction.ToolData)).SetValue(action, _tool);
            Set(_character.ToolActionRegistry, "toolActionPrefabs", new List<ToolAction> { action });
            _character.EnsureRuntimeInitialized();
            _character.MainInventory.AddItem(_tool, 1);
            _character.Loadout.SelectItem(0);
            _toolAction = (StaminaTestToolAction)_character.ToolActionRegistry.GetToolAction(_tool);
            _useTool = new GameObject("Tool dispatcher").AddComponent<UseToolAction>();
            _useTool.transform.SetParent(_fixture.Root.transform);
            _useTool.Initialize(_character);
            CharacterManager.Instance.RegisterMainCharacter(_character);

            _fixture.Root.SetActive(true);
            BuildToolMap();
            var hud = new GameObject("Stamina HUD");
            hud.SetActive(false);
            hud.transform.SetParent(_fixture.Root.transform);
            var document = hud.AddComponent<UIDocument>();
            document.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset");
            document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Hud/GameHud.uxml");
            _presenter = hud.AddComponent<StaminaHudPresenter>();
            hud.SetActive(true);
            GameTestFixture.Invoke(_presenter, "OnEnable");
            _meter = document.rootVisualElement.Q<ProgressBar>("staminaMeter");
            _value = document.rootVisualElement.Q<Label>("staminaValue");
        }

        [TearDown]
        public void TearDown()
        {
            if (_presenter) GameTestFixture.Invoke(_presenter, "OnDisable");
            _fixture.Dispose();
        }

        [TestCase(true)]
        [TestCase(false)]
        public void SuccessfulToolExecutionSpendsItsAuthoredCostAndUpdatesTheBar(bool skipPreparation)
        {
            RunTool(skipPreparation);
            Assert.That(_toolAction.Executions, Is.EqualTo(1));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - _tool.staminaCost));
            Assert.That(GameState.Player.Stamina.Current, Is.EqualTo(95));
            Assert.That(_meter.value, Is.EqualTo(95f).Within(0.001));
            Assert.That(_value.text, Is.EqualTo("95 / 100"));
        }

        [TestCase(true, 95)]
        [TestCase(false, 100)]
        public void RejectedToolUseHonoursItsFailureCostPolicy(bool consumesOnFailure, int expected)
        {
            Set(_tool, "_consumeStaminaOnFailure", consumesOnFailure);
            _toolAction.Allowed = false;
            RunTool();
            Assert.That(_toolAction.Executions, Is.Zero);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(expected));
            Assert.That(_value.text, Is.EqualTo($"{expected} / 100"));
        }

        [Test]
        public void SurplusSpendingRemainsVisibleWithoutStretchingTheBar()
        {
            _character.Stamina.GrantOvercharge(20);
            RunTool();
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(115));
            Assert.That(_meter.value, Is.EqualTo(100f));
            Assert.That(_value.text, Is.EqualTo("115 / 100"));
            _character.Stamina.ConsumeStamina(20);
            Assert.That(_meter.value, Is.EqualTo(95f).Within(0.001));
        }

        [Test]
        public void EnablingTheHudReadsExistingStateAndIgnoresOtherCharacters()
        {
            GameTestFixture.Invoke(_presenter, "OnDisable");
            _character.Stamina.ConsumeStamina(30);
            GameTestFixture.Invoke(_presenter, "OnEnable");
            Assert.That(_meter.value, Is.EqualTo(70f).Within(0.001));
            var other = _fixture.CreateCharacter();
            other.Stamina.ConsumeStamina(50);
            Assert.That(_value.text, Is.EqualTo("70 / 100"));
        }

        [Test]
        public void PlayerReplacementWaitsForResourceBindingThenShowsTheNewPlayer()
        {
            var other = _fixture.CreateCharacter();
            CharacterManager.Instance.RegisterMainCharacter(other);
            Assert.That(_value.text, Is.Empty);
            other.Stamina.Initialize(new StaminaState { Initialized = true, Current = 40 });
            Assert.That(_value.text, Is.EqualTo("40 / 100"));
            _character.Stamina.ConsumeStamina(10);
            Assert.That(_value.text, Is.EqualTo("40 / 100"));
        }

        [Test]
        public void ZeroCapacityHasAnEmptyBarAndNoInvalidRatio()
        {
            _character.Attributes.SetModifier(CharacterAttributeType.MaxStamina, "test:zero", -100);
            Assert.That(_meter.value, Is.Zero);
            Assert.That(_value.text, Is.EqualTo("0 / 0"));
        }

        private void RunTool(bool skipPreparation = true)
        {
            var snapshot = PlayerInteractionContextSnapshot.Empty() with
            {
                SceneReady = true, Character = _character, CurrentTool = _tool, CurrentlyHeldItem = _tool, Mode = Core.Context.InteractionMode.Tool
            };
            var executor = new ActionExecutor(_character, () => snapshot);
            var steps = new Stack<IEnumerator>();
            steps.Push(executor.Run(_useTool, skipPrepare: skipPreparation));
            while (steps.Count > 0)
            {
                var current = steps.Peek();
                if (!current.MoveNext()) { steps.Pop(); continue; }
                if (current.Current is WaitUntil && executor.State == ActionExecutionState.Preparing)
                {
                    Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100), "Aiming must not spend stamina before release.");
                    executor.ContinueFromPrepare();
                }
                if (current.Current is IEnumerator nested) steps.Push(nested);
            }
            Assert.That(executor.IsIdle, Is.True);
        }

        private void BuildToolMap()
        {
            var map = _fixture.RegisterSingleton<Core.Tile.MapManager>();
            var grid = new GameObject("Tool map", typeof(Grid));
            grid.transform.SetParent(_fixture.Root.transform);
            var tiles = new GameObject("Terrain", typeof(UnityEngine.Tilemaps.Tilemap));
            tiles.transform.SetParent(grid.transform);
            var tilemap = tiles.GetComponent<UnityEngine.Tilemaps.Tilemap>();
            var terrain = _fixture.Own(ScriptableObject.CreateInstance<Core.Tile.TerrainData>());
            var cache = new Dictionary<Vector2Int, Core.Tile.TileData>();
            for (var y = -1; y <= 1; y++)
                cache.Add(new Vector2Int(0, y), new Core.Tile.TileData(null, 0, y, terrain,
                    tilemap.GetCellCenterWorld(new Vector3Int(0, y, 0))));
            Set(map, "_terrainTilemap", tilemap);
            Set(map, "_tileDataCache", cache);
            _character.ToolInteractionAnchor.position = new Vector3(0.25f, 0.25f, 0f);
            _character.Tiles.EnterLocation(map);
        }

        private static void Set(object target, string field, object value) => target.GetType()
            .GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(target, value);
    }

    /// <summary>A deterministic tool effect so the test exercises resource spending without changing terrain.</summary>
    public sealed class StaminaTestToolAction : ToolAction
    {
        public bool Allowed = true;
        public int Executions;
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) => Allowed;
        public override IEnumerator OnExecute(PlayerInteractionContextSnapshot snapshot) { Executions++; yield break; }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }
}
