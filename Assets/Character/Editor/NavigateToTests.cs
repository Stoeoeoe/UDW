using System;
using System.Linq;
using Core.Common.Editor;
using Core.Tile;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Tilemaps;
using static Core.Common.Editor.Reflect;

namespace Character.Editor
{
    /// <summary>Runs CharacterNavigation.NavigateTo on an empty 32x24 map with scripted physics.</summary>
    [Category("Navigation")]
    public sealed class NavigateToTests : GameTest
    {
        private const int MapWidth = 32, MapHeight = 24;

        private MainCharacter _actor;
        private MapManager _maps;
        private Rigidbody2D _body;
        private Collider2D _solid;
        private Vector2 _feetOffset;
        private SimulationMode2D _simulationMode;

        [SetUp]
        public void SetUp()
        {
            _simulationMode = Physics2D.simulationMode;
            Physics2D.simulationMode = SimulationMode2D.Script;
            _maps = Game.Get<MapManager>();
            _actor = Game.CreateCharacter();
            _actor.EnsureRuntimeInitialized();
            _actor.transform.parent.gameObject.SetActive(true);

            var mapRoot = new GameObject("NavigateTo test map", typeof(Grid), typeof(VulcanusImportedMap));
            mapRoot.transform.SetParent(Game.Root.transform);
            var map = mapRoot.GetComponent<VulcanusImportedMap>();
            map.Configure("test:navigate", "Navigate test map", MapWidth, MapHeight, 16);
            Tilemap Layer(string name)
            {
                var layer = new GameObject(name, typeof(Tilemap));
                layer.transform.SetParent(mapRoot.transform, false);
                return layer.GetComponent<Tilemap>();
            }
            var terrain = Layer("Terrain");
            map.SetTilemaps(terrain, Layer("Farmland"), Layer("Plowed"), Layer("Irrigated"), Layer("Overlay"));
            map.SetTerrainCells(Array.Empty<VulcanusImportedMap.TerrainCell>());
            var costs = new byte[MapWidth * MapHeight];
            Array.Fill(costs, (byte)NavigationCostGrid.DefaultCost);
            map.SetNavigationCostGrid(new NavigationCostGrid(MapWidth, MapHeight, costs));
            Set(_maps, "_currentMap", map);
            Set(_maps, "_terrainTilemap", terrain);
            Game.Ready = true;
            Game.Root.SetActive(true);

            _body = _actor.GetComponent<Rigidbody2D>();
            _solid = _actor.GetComponentsInChildren<Collider2D>().First(c => !c.isTrigger && c.attachedRigidbody == _body);
            _feetOffset = (Vector2)(_actor.Graphics.position - _actor.transform.position);
            PlaceFeetAtCell(_actor, new Vector2Int(5, 5));
        }

        [TearDown]
        public void TearDown() => Physics2D.simulationMode = _simulationMode;

        [Test]
        public void WalksToTheMiddleOfTheDrawnTile()
        {
            // A tile's sprite hangs half a cell below its logical cell, so its middle is on the cell's lower edge.
            Assert.That(_maps.TileToVisualCenter(new Vector2Int(5, 5)), Is.EqualTo(new Vector2(5.5f, 5f)));
            Assert.That(_maps.WorldToVisualTile(new Vector2(5.5f, 4.6f)), Is.EqualTo(new Vector2Int(5, 5)), "Lower half of the drawn tile.");
            Assert.That(_maps.WorldToVisualTile(new Vector2(5.5f, 5.4f)), Is.EqualTo(new Vector2Int(5, 5)), "Upper half of the drawn tile.");

            using var route = CharacterNavigation.NavigateTo(_actor, _maps.TileToVisualCenter(new Vector2Int(9, 5)), _maps);
            Run(route);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Arrived), route.Error);
            Assert.That(_body.position.y + _feetOffset.y, Is.EqualTo(5f).Within(0.04f));
        }

        [Test]
        public void PlanningMeasuresTheRouteWithoutMovingTheCharacter()
        {
            AddWall(new Vector2(10.5f, 5.5f), new Vector2(1f, 6f));
            var start = _body.position + _feetOffset;
            var destination = CellCenter(15, 5);

            var plan = CharacterNavigation.PlanRoute(_actor, destination, _maps);
            Assert.That(plan.Found, Is.True, plan.Error);
            Assert.That(_actor.Controller.IsMovementOwned, Is.False, "Planning never claims the character.");
            Assert.That(_body.position + _feetOffset, Is.EqualTo(start));

            Assert.That(plan.StartFeet, Is.EqualTo(start));
            Assert.That(plan.Waypoints.Last(), Is.EqualTo(destination));
            Assert.That(plan.Length, Is.GreaterThan(Vector2.Distance(start, destination) + 1f), "The detour around the wall is longer.");
            Assert.That(plan.PointAt(0), Is.EqualTo(start));
            Assert.That(plan.PointAt(plan.Length), Is.EqualTo(destination));
            Assert.That(plan.PointAt(plan.Length + 10), Is.EqualTo(destination), "Walking past the end stays at the destination.");
            var halfway = plan.PointAt(plan.Length / 2);
            Assert.That(Vector2.Distance(halfway, start), Is.GreaterThan(1f));
            Assert.That(Vector2.Distance(halfway, destination), Is.GreaterThan(1f));
        }

        [Test]
        public void WalksAroundAWallThatBlocksTheStraightLine()
        {
            AddWall(new Vector2(10.5f, 5.5f), new Vector2(1f, 6f));
            var destination = CellCenter(15, 5);
            using (var straight = CharacterNavigation.MoveTo(_actor, destination - _feetOffset))
                Assert.That(straight.Status, Is.EqualTo(NavigationMoveStatus.Unreachable), "The wall must block the straight line.");

            using var route = CharacterNavigation.NavigateTo(_actor, destination, _maps);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Moving), route.Error);
            Assert.That(route.Waypoints.Count, Is.GreaterThan(1));
            Assert.That(route.Waypoints.Any(point => point.y >= 9f || point.y < 3f), Is.True, "The route must detour around the wall.");
            Assert.That(route.Waypoints.Last(), Is.EqualTo(destination), "The final waypoint is the exact destination.");
            Run(route);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Arrived), route.Error);
            Assert.That(Vector2.Distance(_body.position + _feetOffset, destination), Is.LessThanOrEqualTo(0.04f));
            AssertReleased();
        }

        [Test]
        public void WalksThroughAnotherCharacterStandingOnTheRoute()
        {
            var blocker = Game.CreateCharacter("Blocker");
            blocker.transform.parent.gameObject.SetActive(true);
            blocker.transform.position = new Vector3(10.5f, _actor.transform.position.y, 0f); // same footprint row as the walker
            blocker.GetComponent<Rigidbody2D>().bodyType = RigidbodyType2D.Kinematic;
            Physics2D.SyncTransforms();
            var destination = CellCenter(15, 5);

            using (var straight = CharacterNavigation.MoveTo(_actor, destination - _feetOffset))
            {
                Assert.That(straight.Status, Is.EqualTo(NavigationMoveStatus.Unreachable), "Without pass-through the character blocks.");
                Assert.That(straight.Error, Does.Contain("layer 'Characters'"));
            }

            using var route = CharacterNavigation.NavigateTo(_actor, destination, _maps);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Moving), route.Error);
            Assert.That(route.Waypoints.Count, Is.EqualTo(1), "Characters never block the plan.");
            Run(route);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Arrived), route.Error);
            Assert.That(Vector2.Distance(_body.position + _feetOffset, destination), Is.LessThanOrEqualTo(0.04f));
            AssertReleased();
        }

        [Test]
        public void StillCollidesWithAWallThatAppearsOnTheRoute()
        {
            var destination = CellCenter(15, 5);
            using var route = CharacterNavigation.NavigateTo(_actor, destination, _maps);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Moving), route.Error);
            AddWall(new Vector2(10.5f, 5.5f), new Vector2(0.5f, 6f)); // after planning, so only physics can stop the walker

            Run(route, 400);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Moving));
            Assert.That(_body.position.x + _feetOffset.x, Is.LessThan(10.25f), "Walls keep their contacts during pass-through.");
        }

        [Test]
        public void RestoresColliderExclusionsAfterArrivalAndAfterDisposalMidRoute()
        {
            _solid.excludeLayers = 1 << 31;
            _solid.layerOverridePriority = 7;
            var characters = NavigationMove.CharactersLayerMask;

            using (var route = CharacterNavigation.NavigateTo(_actor, CellCenter(8, 5), _maps))
            {
                Assert.That(_solid.excludeLayers.value, Is.EqualTo((1 << 31) | characters), "Only characters are excluded while walking.");
                Run(route);
                Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Arrived), route.Error);
            }
            Assert.That(_solid.excludeLayers.value, Is.EqualTo(1 << 31));
            Assert.That(_solid.layerOverridePriority, Is.EqualTo(7));

            var cancelled = CharacterNavigation.NavigateTo(_actor, CellCenter(20, 5), _maps);
            Run(cancelled, 20);
            Assert.That(cancelled.Status, Is.EqualTo(NavigationMoveStatus.Moving));
            cancelled.Dispose();
            Assert.That(cancelled.Status, Is.EqualTo(NavigationMoveStatus.Cancelled));
            Assert.That(_solid.excludeLayers.value, Is.EqualTo(1 << 31));
            Assert.That(_solid.layerOverridePriority, Is.EqualTo(7));
            AssertReleased();
        }

        [Test]
        public void ReportsUnreachableWhenTheDestinationIsEnclosed()
        {
            AddWall(new Vector2(20.5f, 16.5f), new Vector2(3f, 1f));
            AddWall(new Vector2(20.5f, 14.5f), new Vector2(3f, 1f));
            AddWall(new Vector2(19.5f, 15.5f), new Vector2(1f, 1f));
            AddWall(new Vector2(21.5f, 15.5f), new Vector2(1f, 1f));

            using var route = CharacterNavigation.NavigateTo(_actor, CellCenter(20, 15), _maps);
            Assert.That(route.Status, Is.EqualTo(NavigationMoveStatus.Unreachable));
            Assert.That(route.Error, Does.Contain(_actor.name).And.Contain("(5, 5)").And.Contain("(20, 15)"));
            AssertReleased();
        }

        private void Run(NavigationRoute route, int maxSteps = 4000)
        {
            for (var step = 0; step < maxSteps && route.Status == NavigationMoveStatus.Moving; step++)
            {
                route.Tick(Time.fixedDeltaTime);
                GameTestFixture.Invoke(_actor.Controller, "FixedUpdate");
                Assert.That(Physics2D.Simulate(Time.fixedDeltaTime), Is.True);
            }
        }

        private void AssertReleased()
        {
            Assert.That(_actor.Controller.IsMovementOwned, Is.False);
            Assert.That(_actor.IsControlBlocked, Is.False);
        }

        // Cells are walked at the middle of the tile as drawn, which is half a cell below the logical cell.
        private Vector2 CellCenter(int x, int y) => _maps.TileToVisualCenter(new Vector2Int(x, y));

        private void PlaceFeetAtCell(GameCharacter character, Vector2Int cell)
        {
            character.transform.position = CellCenter(cell.x, cell.y) - _feetOffset;
            Physics2D.SyncTransforms();
        }

        private void AddWall(Vector2 center, Vector2 size)
        {
            var charactersLayer = LayerMask.NameToLayer(NavigationMove.CharactersLayerName);
            var mask = Physics2D.GetLayerCollisionMask(_solid.gameObject.layer);
            var wall = new GameObject("Navigate test wall", typeof(BoxCollider2D));
            wall.transform.SetParent(Game.Root.transform);
            wall.transform.position = center + MapManager.TileVisualOffset; // callers give logical cell coordinates
            wall.layer = Enumerable.Range(0, 31).First(layer => layer != charactersLayer && (mask & (1 << layer)) != 0);
            wall.GetComponent<BoxCollider2D>().size = size;
            Physics2D.SyncTransforms();
        }
    }
}
