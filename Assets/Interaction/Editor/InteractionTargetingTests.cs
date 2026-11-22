using System.Collections.Generic;
using Character;
using Core.Common.Editor;
using Core.Context;
using Core.Tile;
using NUnit.Framework;
using SensorToolkit;
using UnityEngine;
using UnityEngine.Tilemaps;
using static Core.Common.Editor.Reflect;
using TerrainData = Core.Tile.TerrainData;
using TileData = Core.Tile.TileData;

namespace Interaction.Editor
{
    /// <summary>A ready interactable that needs a button press and does nothing else.</summary>
    public sealed class TargetingProbe : AbstractInteractable
    {
        protected override bool Interact(GameCharacter instigator) => true;
    }

    /// <summary>Which interactable the player targets: only those next to the player, picked by facing or by hovered pixels.</summary>
    public sealed class InteractionTargetingTests : GameTest
    {
        private MainCharacter _player;
        private InteractionSensor _sensor;
        private Texture2D _texture;
        private Dictionary<Vector2Int, TileData> _tiles;

        [SetUp]
        public void SetUp()
        {
            Game.Root.SetActive(true); // Grid needs an active hierarchy to initialize its cell conversion.
            var map = Game.Get<MapManager>();
            var grid = new GameObject("Grid", typeof(Grid));
            grid.transform.SetParent(Game.Root.transform);
            var tileRoot = new GameObject("Tiles", typeof(Tilemap));
            tileRoot.transform.SetParent(grid.transform);
            var tilemap = tileRoot.GetComponent<Tilemap>();
            var tiles = new Dictionary<Vector2Int, TileData>();
            var terrain = Game.Asset<TerrainData>();
            for (var x = -4; x <= 4; x++)
                for (var y = -4; y <= 4; y++)
                    tiles.Add(new Vector2Int(x, y), new TileData(null, x, y, terrain, tilemap.GetCellCenterWorld(new Vector3Int(x, y, 0))));
            Set(map, "_terrainTilemap", tilemap);
            Set(map, "_tileDataCache", tiles);
            _tiles = tiles;

            _player = Game.CreatePlayer();
            GameTestFixture.PlaceCharacterAtGroundPoint(_player, new Vector3(0.5f, 0.5f));
            _player.transform.parent.gameObject.SetActive(true); // The nearby sensor only pulses while active.
            _player.Tiles.EnterLocation(map);
            _sensor = _player.InteractionSensor;
            Game.Wake(_sensor);

            // Left half transparent, right half opaque; one tile wide, pivot at the bottom centre.
            _texture = new Texture2D(4, 4) { filterMode = FilterMode.Point };
            for (var x = 0; x < 4; x++)
                for (var y = 0; y < 4; y++)
                    _texture.SetPixel(x, y, x < 2 ? Color.clear : Color.white);
            _texture.Apply();
        }

        [TearDown]
        public void DestroyTexture() => Object.DestroyImmediate(_texture);

        [Test]
        public void FacingPicksTheTargetClosestToTheFacingDirectionAmongTheNineTiles()
        {
            var above = Probe(new Vector2Int(0, 1));
            var right = Probe(new Vector2Int(1, 0));
            var farBelow = Probe(new Vector2Int(0, -2));

            Assert.That(Face(Vector2.up), Is.SameAs(above));
            Assert.That(Face(Vector2.right), Is.SameAs(right));
            Assert.That(Face(Vector2.left), Is.SameAs(above), "Sideways at 90 degrees still counts; the nearer one wins the tie.");
            Assert.That(Face(Vector2.down), Is.SameAs(right), "Two tiles away is out of reach even straight ahead.");

            farBelow.transform.position += Vector3.up;
            Assert.That(Face(Vector2.down), Is.SameAs(farBelow));
        }

        [Test]
        public void TargetsAreFoundWhereTheMapStoresNoTileData()
        {
            // Indoor floors can be cells without tile data under the player.
            var bed = Probe(new Vector2Int(0, 1));
            _tiles.Remove(Vector2Int.zero);
            _player.Tiles.OnPlaced();
            Assume.That(_player.Tiles.Current, Is.Null);

            Assert.That(Face(Vector2.up), Is.SameAs(bed));
            Assert.That(Hover(new Vector2(0.75f, 1.5f)), Is.SameAs(bed));
        }

        [Test]
        public void ABenchOnTheWrongLayerFailsAtStartup()
        {
            var bench = Probe(new Vector2Int(0, 1));
            bench.gameObject.layer = 0;
            Assert.Throws<System.InvalidOperationException>(() => GameTestFixture.Invoke(bench, "Awake"));
        }

        [Test]
        public void NothingBehindTheCharacterIsPickedByFacing()
        {
            Probe(new Vector2Int(0, -1));
            Assert.That(Face(Vector2.up), Is.Null);
        }

        [Test]
        public void ReachUsesTheTargetsSolidCollidersNotItsLargeInteractionTrigger()
        {
            // Like a character: a large talk trigger around a small body two tiles above the player.
            var talker = Probe(new Vector2Int(0, 2), triggerSize: 2.4f);
            Assert.That(Face(Vector2.up), Is.Null);

            // Without its own art and body, the interaction trigger is the footprint, as for a door.
            Set(talker, "target", null);
            Assert.That(Face(Vector2.up), Is.SameAs(talker));
        }

        [Test]
        public void ThePointerHoversOnlyVisiblePixelsOfTargetsInReach()
        {
            var chest = Probe(new Vector2Int(1, 1));
            var tileCorner = new Vector2(1f, 1f);
            Assert.That(Hover(tileCorner + new Vector2(0.25f, 0.5f)), Is.Null, "Transparent pixel.");
            Assert.That(Hover(tileCorner + new Vector2(0.75f, 0.5f)), Is.SameAs(chest));
            Assert.That(Hover(tileCorner + new Vector2(0.75f, 1.5f)), Is.Null, "Outside the sprite.");

            chest.transform.position += Vector3.right * 2;
            Assert.That(Hover(tileCorner + new Vector2(2.75f, 0.5f)), Is.Null, "Out of reach.");
        }

        [Test]
        public void WithoutATargetThePointerHoversTheInteractionCollider()
        {
            var door = Probe(new Vector2Int(0, 1));
            Set(door, "target", null);
            Assert.That(Hover(new Vector2(0.25f, 1.5f)), Is.SameAs(door), "A transparent pixel is still inside the collider.");
        }

        [Test]
        public void PointerPlayUsesOnlyTheHoveredTargetAndFacingPlayOnlyTheOneInFront()
        {
            var inFront = Probe(new Vector2Int(0, 1));
            var snapshot = PlayerInteractionContextSnapshot.Empty() with
            {
                SceneReady = true, Character = _player, CurrentInteractable = inFront
            };
            Assert.That(snapshot.ActionableInteractable, Is.SameAs(inFront));
            Assert.That((snapshot with { UsesPointer = true }).ActionableInteractable, Is.Null);

            var hovered = Probe(new Vector2Int(1, 0));
            Assert.That((snapshot with { UsesPointer = true, InteractableUnderPointer = hovered }).ActionableInteractable,
                Is.SameAs(hovered));
            Assert.That((snapshot with { InteractableUnderPointer = hovered }).ActionableInteractable, Is.SameAs(inFront));
        }

        private AbstractInteractable Face(Vector2 direction)
        {
            _player.Orientation.ForceDirection(direction);
            Pulse();
            return _sensor.FindInFront();
        }

        private AbstractInteractable Hover(Vector2 point)
        {
            Pulse();
            return _sensor.FindUnderPointer(point);
        }

        private void Pulse()
        {
            Physics2D.SyncTransforms();
            _player.GetComponentInChildren<RangeSensor2D>().Pulse();
        }

        // An interactable on a tile: its trigger, a one-tile sprite and a small solid body at the tile's bottom.
        private TargetingProbe Probe(Vector2Int tile, float triggerSize = 0.8f)
        {
            var root = new GameObject($"Probe {tile}") { layer = LayerMask.NameToLayer("Interactable") };
            root.SetActive(false);
            root.transform.SetParent(Game.Root.transform);
            root.transform.position = new Vector3(tile.x + 0.5f, tile.y, 0f);
            var trigger = root.AddComponent<BoxCollider2D>();
            trigger.isTrigger = true;
            trigger.size = Vector2.one * triggerSize;
            trigger.offset = new Vector2(0f, 0.5f);

            var art = new GameObject("Art");
            art.transform.SetParent(root.transform, false);
            art.AddComponent<SpriteRenderer>().sprite =
                Sprite.Create(_texture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0f), 4f);
            var body = new GameObject("Body");
            body.transform.SetParent(art.transform, false);
            var solid = body.AddComponent<BoxCollider2D>();
            solid.size = new Vector2(0.6f, 0.4f);
            solid.offset = new Vector2(0f, 0.3f);

            var probe = Game.Add<TargetingProbe>(root);
            Set(probe, "target", art.transform);
            root.SetActive(true);
            Game.Wake(probe);
            return probe;
        }
    }
}
