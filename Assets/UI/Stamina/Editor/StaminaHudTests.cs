using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Character;
using Core.Common.Editor;
using Core.Context;
using Core.Game;
using Core.Tile;
using Interaction;
using Interaction.Tools;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;
using UnityEngine.UIElements;
using static Core.Common.Editor.Reflect;
using InteractionMode = Core.Context.InteractionMode;
using TerrainData = Core.Tile.TerrainData;
using TileData = Core.Tile.TileData;

namespace UI.Stamina.Editor
{
    /// <summary>Checks real tool dispatch and the authored stamina bar against the same live player resource.</summary>
    public sealed class StaminaHudTests : GameTest
    {

        private MainCharacter _character;
        private ToolData _tool;
        private UseToolAction _useTool;
        private StaminaTestToolAction _toolAction;
        private StaminaHudPresenter _presenter;
        private ProgressBar _meter;
        private Label _value;
        private ProgressBar _healthMeter;
        private Label _healthValue;

        [SetUp]
        public void SetUp()
        {

            Game.State.Time.daysSinceStart = 1;
            Game.State.Player.Home = new PlayerHomeState("test:home", "test-bed");
            _character = Game.CreateCharacter();
            _tool = Game.Own(Game.InjectObject(Object.Instantiate(AssetDatabase.LoadAssetAtPath<ToolData>("Assets/Resources/Items/Tools/HoeToolData.asset"))));
            Set(_tool, "ShowTileHighlighterOnPrepare", false);
            var template = new GameObject("Test tool action");
            template.transform.SetParent(Game.Root.transform);
            var action = Game.Add<StaminaTestToolAction>(template);
            typeof(ToolAction).GetProperty(nameof(ToolAction.ToolData)).SetValue(action, _tool);
            Set(_character.ToolActionRegistry, "toolActionPrefabs", new List<ToolAction> { action });
            _character.EnsureRuntimeInitialized();
            _character.MainInventory.AddItem(_tool, 1);
            _character.Loadout.SelectItem(0);
            _toolAction = (StaminaTestToolAction)_character.ToolActionRegistry.GetToolAction(_tool);
            _useTool = new GameObject("Tool dispatcher").AddComponent<UseToolAction>();
            _useTool.transform.SetParent(Game.Root.transform);
            _useTool.Initialize(_character);
            Game.Get<CharacterManager>().RegisterMainCharacter(_character);

            Game.Root.SetActive(true);
            BuildToolMap();
            var hud = new GameObject("Stamina HUD");
            hud.SetActive(false);
            hud.transform.SetParent(Game.Root.transform);
            var document = hud.AddComponent<UIDocument>();
            document.panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/UI/InventoryScreen/InventoryPanelSettings.asset");
            document.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/UI/Hud/GameHud.uxml");
            _presenter = Game.Add<StaminaHudPresenter>(hud);
            hud.SetActive(true);
            GameTestFixture.Invoke(_presenter, "OnEnable");
            _meter = document.rootVisualElement.Q<ProgressBar>("staminaMeter");
            _value = document.rootVisualElement.Q<Label>("staminaValue");
            _healthMeter = document.rootVisualElement.Q<ProgressBar>("healthMeter");
            _healthValue = document.rootVisualElement.Q<Label>("healthValue");
        }

        [TearDown]
        public void TearDown()
        {
            if (_presenter) GameTestFixture.Invoke(_presenter, "OnDisable");

        }

        [TestCase(true)]
        [TestCase(false)]
        public async Task SuccessfulToolExecutionSpendsItsAuthoredCostAndUpdatesTheBar(bool skipPreparation)
        {
            await RunTool(skipPreparation);
            Assert.That(_toolAction.Executions, Is.EqualTo(1));
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100 - _tool.StaminaCost));
            Assert.That(Game.State.Player.Stamina.Current, Is.EqualTo(95));
            Assert.That(_meter.value, Is.EqualTo(95f).Within(0.001));
            Assert.That(_value.text, Is.EqualTo("95 / 100"));
        }

        [TestCase(true, 95)]
        [TestCase(false, 100)]
        public async Task RejectedToolUseHonoursItsFailureCostPolicy(bool consumesOnFailure, int expected)
        {
            Set(_tool, "ConsumeStaminaOnFailure", consumesOnFailure);
            _toolAction.Allowed = false;
            await RunTool();
            Assert.That(_toolAction.Executions, Is.Zero);
            Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(expected));
            Assert.That(_value.text, Is.EqualTo($"{expected} / 100"));
        }

        [Test]
        public void HealthBarTracksPlayerDamageHealingAndSurplusOnly()
        {
            Assert.That(_healthValue.text, Is.EqualTo("100 / 100"));
            _character.Health.TakeDamage(30);
            Assert.That(_healthMeter.value, Is.EqualTo(70f));
            Assert.That(_healthValue.text, Is.EqualTo("70 / 100"));
            var other = Game.CreateCharacter();
            other.Health.TakeDamage(50);
            Assert.That(_healthValue.text, Is.EqualTo("70 / 100"));
            _character.Health.Heal(30);
            _character.Health.GrantOvercharge(20);
            Assert.That(_healthMeter.value, Is.EqualTo(100f));
            Assert.That(_healthValue.text, Is.EqualTo("120 / 100"));
        }

        [Test]
        public async Task SurplusSpendingRemainsVisibleWithoutStretchingTheBar()
        {
            _character.Stamina.GrantOvercharge(20);
            await RunTool();
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
            var other = Game.CreateCharacter();
            other.Stamina.ConsumeStamina(50);
            Assert.That(_value.text, Is.EqualTo("70 / 100"));
        }

        [Test]
        public void PlayerReplacementWaitsForResourceBindingThenShowsTheNewPlayer()
        {
            var other = Game.CreateCharacter();
            Game.Get<CharacterManager>().RegisterMainCharacter(other);
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

        private async Task RunTool(bool skipPreparation = true)
        {
            var snapshot = PlayerInteractionContextSnapshot.Empty() with
            {
                SceneReady = true, Character = _character, CurrentTool = _tool, CurrentlyHeldItem = _tool, Mode = InteractionMode.Tool
            };
            var executor = new ActionExecutor(_character, () => snapshot);
            var run = executor.RunAsync(_useTool, skipPrepare: skipPreparation);
            try
            {
                if (executor.State == ActionExecutionState.Preparing)
                {
                    Assert.That(_character.Stamina.CurrentStamina, Is.EqualTo(100), "Aiming must not spend stamina before release.");
                    executor.ContinueFromPrepare();
                }
                // These assertions concern the committed effect; native presentation timing is covered in gameplay tests.
                executor.InterruptCurrentAction();
                await run;
            }
            finally { executor.InterruptCurrentAction(); }
            Assert.That(executor.IsIdle, Is.True);
        }

        private void BuildToolMap()
        {
            var map = Game.Get<MapManager>();
            var grid = new GameObject("Tool map", typeof(Grid));
            grid.transform.SetParent(Game.Root.transform);
            var tiles = new GameObject("Terrain", typeof(Tilemap));
            tiles.transform.SetParent(grid.transform);
            var tilemap = tiles.GetComponent<Tilemap>();
            var terrain = Game.Asset<TerrainData>();
            var cache = new Dictionary<Vector2Int, TileData>();
            for (var y = -1; y <= 1; y++)
                cache.Add(new Vector2Int(0, y), new TileData(null, 0, y, terrain,
                    tilemap.GetCellCenterWorld(new Vector3Int(0, y, 0))));
            Set(map, "_terrainTilemap", tilemap);
            Set(map, "_tileDataCache", cache);
            GameTestFixture.PlaceCharacterAtGroundPoint(_character, new Vector3(0.25f, 0.25f, 0f));
            _character.Tiles.EnterLocation(map);
        }

    }

    /// <summary>A deterministic tool effect so the test exercises resource spending without changing terrain.</summary>
    public sealed class StaminaTestToolAction : ToolAction
    {
        public bool Allowed = true;
        public int Executions;
        public override bool CanExecute(PlayerInteractionContextSnapshot snapshot) => Allowed;
        public override Awaitable OnExecute(PlayerInteractionContextSnapshot snapshot, CancellationToken cancellation) { Executions++; return Completed(); }
        public override void Interrupt(PlayerInteractionContextSnapshot snapshot) { }
    }
}
