using System;
using Core.Tile.Editor.Vulcanus;
using NUnit.Framework;
using UnityEngine;

namespace Core.Tile.Editor
{
    // Strokes use Unity logical pixels here (y up): a pixel index i covers [i, i + 1).
    [Category("MapLoading")]
    public sealed class WaterFlowFieldTests
    {
        private const int Size = 40;

        private static bool[] Grid(int size, Func<int, int, bool> isWater)
        {
            var water = new bool[size * size];
            for (var y = 0; y < size; y++)
                for (var x = 0; x < size; x++) water[y * size + x] = isWater(x, y);
            return water;
        }

        // A river entering at the top, running down, then turning east and leaving at the right edge.
        private static bool[] BentRiver() => Grid(Size, (x, y) => (x is >= 16 and <= 23 && y >= 16) || (y is >= 16 and <= 23 && x >= 16));

        private static float[] OpenShore(int size = Size) { var shore = new float[size * size]; Array.Fill(shore, 8f); return shore; }

        private static FlowStrokeData Stroke(float width, float speed, params float[] xy)
        {
            var points = new Vector2[xy.Length / 2];
            for (var i = 0; i < points.Length; i++) points[i] = new Vector2(xy[i * 2], xy[i * 2 + 1]);
            return new FlowStrokeData(points, width, speed);
        }

        private static FlowResult Flow(bool[] water, int size, float[] shore, params FlowStrokeData[] strokes) =>
            WaterFlowField.Compute(water, shore ?? OpenShore(size), Vector2Int.zero, size, size, strokes, "river");

        // The bend's centre line, entering at the top edge and leaving at the right edge.
        private static FlowStrokeData BendStroke(float width = 1, float speed = 1) =>
            Stroke(width, speed, 20, 39.5f, 20, 20, 39.5f, 20);

        private static Vector2 Direction(byte[] bytes, int x, int y, int size = Size) =>
            new(bytes[(y * size + x) * 3] - 128, bytes[(y * size + x) * 3 + 1] - 128);

        private static byte Speed(byte[] bytes, int x, int y, int size = Size) => bytes[(y * size + x) * 3 + 2];

        [Test]
        public void CurrentsFollowTheRiverFromInletToOutlet()
        {
            var bytes = Flow(BentRiver(), Size, null, BendStroke()).Bytes;
            Assert.That(Direction(bytes, 19, 35).y, Is.LessThan(-100), "The upstream leg flows down.");
            Assert.That(Math.Abs(Direction(bytes, 19, 35).x), Is.LessThan(25), "Far upstream, water runs along the banks, not towards the bend.");
            Assert.That(Direction(bytes, 35, 19).x, Is.GreaterThan(100), "The downstream leg flows east.");
            Assert.That(Math.Abs(Direction(bytes, 35, 19).y), Is.LessThan(25));
            Assert.That(Direction(bytes, 18, 18).x, Is.GreaterThan(20), "The bend turns the current.");
            Assert.That(Direction(bytes, 18, 18).y, Is.LessThan(-20));
            Assert.That(Speed(bytes, 19, 35), Is.InRange(240, 255), "Open water runs at full speed.");
            Assert.That(Speed(bytes, 0, 0), Is.Zero, "Land is still.");
            Assert.That(Direction(bytes, 0, 0), Is.EqualTo(Vector2.zero));
        }

        [Test]
        public void WaterNearBanksIsSlower()
        {
            var shore = OpenShore();
            shore[35 * Size + 19] = 0.5f;
            var bytes = Flow(BentRiver(), Size, shore, BendStroke()).Bytes;
            Assert.That(Speed(bytes, 19, 35), Is.InRange(85, 125));
        }

        [Test]
        public void SideBaysAreNearlyStill()
        {
            const int size = 48;
            // A channel flowing down with a dead-end bay on its east side.
            var water = Grid(size, (x, y) => x is >= 20 and <= 27 || (x is >= 28 and <= 39 && y is >= 24 and <= 39));
            var bytes = Flow(water, size, null, Stroke(1, 1, 24, 47.5f, 24, 0.5f)).Bytes;
            Assert.That(Speed(bytes, 23, 10, size), Is.GreaterThan(200));
            Assert.That(Speed(bytes, 38, 38, size), Is.LessThan(80));
        }

        [Test]
        public void ADrawnDirectionPullsTheCurrentTowardsTheStroke()
        {
            // An open square with a current running east through the middle. Up in the corner the potential alone
            // arcs the water upwards and over; a wide stroke pulls it back towards the stroke's own direction.
            var lake = Grid(Size, (_, _) => true);
            Vector2 Corner(float reach) => Direction(Flow(lake, Size, null, Stroke(reach, 1, 0.5f, 20, 39.5f, 20)).Bytes, 2, 38);

            var narrow = Corner(1);
            var wide = Corner(40);
            Assert.That(Math.Abs(narrow.y), Is.GreaterThan(40), "Without a pull the corner is steered by the potential alone.");
            Assert.That(Math.Abs(wide.y), Is.LessThan(Math.Abs(narrow.y)), "A wide stroke flattens it towards east.");
            Assert.That(wide.x, Is.GreaterThan(narrow.x));
        }

        [Test]
        public void FasterStrokesRunFullSpeedAndEverythingElseScalesAgainstThem()
        {
            // A wide channel with a double-speed stroke down its middle.
            var water = Grid(Size, (x, _) => x is >= 10 and <= 29);
            var result = Flow(water, Size, null, Stroke(5, 2, 20, 39.5f, 20, 0.5f));
            Assert.That(result.SpeedScale, Is.EqualTo(2));
            Assert.That(Speed(result.Bytes, 20, 20), Is.InRange(240, 255), "On the stroke the water runs at twice the profile speed.");
            Assert.That(Speed(result.Bytes, 11, 20), Is.InRange(110, 145), "Beyond its reach the profile's own speed is half of that.");
        }

        [Test]
        public void ATributaryJoiningAnotherStrokeIsNotASink()
        {
            // A vertical river with a side channel entering from the west.
            var water = Grid(Size, (x, y) => x is >= 16 and <= 23 || (y is >= 28 and <= 31 && x < 16));
            var main = Stroke(4, 1, 20, 39.5f, 20, 0.5f);
            var tributary = Stroke(4, 1, 0.5f, 30, 20, 30);
            var bytes = Flow(water, Size, null, main, tributary).Bytes;
            Assert.That(Direction(bytes, 8, 30).x, Is.GreaterThan(60), "The side channel flows into the river.");
            Assert.That(Direction(bytes, 19, 10).y, Is.LessThan(-60), "The river still flows out the bottom.");
        }

        [Test]
        public void ACurrentThatStartsOrEndsOnLandFails()
        {
            var onLand = Stroke(1, 1, 3, 39.5f, 3, 3, 39.5f, 20);
            Assert.That(Assert.Throws<InvalidOperationException>(() => Flow(BentRiver(), Size, null, onLand)).Message, Does.Contain("on land"));
        }

        [Test]
        public void CurrentsThatAreNotConnectedThroughWaterFail()
        {
            var water = BentRiver();
            // The potential is solved on 4-pixel cells, so a break must be at least that thick.
            for (var y = 28; y < 32; y++)
                for (var x = 16; x < 24; x++) water[y * Size + x] = false;
            Assert.That(Assert.Throws<InvalidOperationException>(() => Flow(water, Size, null, BendStroke())).Message, Does.Contain("not connected"));
        }

        [Test]
        public void StrokesWhoseEndsAllLieOnEachOtherHaveNoSourceOrSink()
        {
            var lake = Grid(Size, (_, _) => true);
            var there = Stroke(30, 1, 10, 10, 30, 30);
            var back = Stroke(30, 1, 30, 30, 10, 10);
            Assert.That(Assert.Throws<InvalidOperationException>(() => Flow(lake, Size, null, there, back)).Message, Does.Contain("no free start"));
        }
    }
}
