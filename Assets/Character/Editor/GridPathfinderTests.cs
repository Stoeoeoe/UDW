using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Character.Editor
{
    [Category("Navigation")]
    public sealed class GridPathfinderTests
    {
        private const int Size = 12;
        private static readonly RectInt Bounds = new(0, 0, Size, Size);

        private int[,] _costs;

        [SetUp]
        public void SetUp()
        {
            _costs = new int[Size, Size];
            for (var x = 0; x < Size; x++)
                for (var y = 0; y < Size; y++)
                    _costs[x, y] = 2; // the default cost
        }

        [Test]
        public void StartEqualToGoalSucceedsWithNoWaypoints()
        {
            Assert.That(Find(new Vector2Int(3, 3), new Vector2Int(3, 3), out var waypoints, out var total), Is.True);
            Assert.That(waypoints, Is.Empty);
            Assert.That(total, Is.EqualTo(0f));
        }

        [Test]
        public void StraightRunsMergeIntoASingleWaypoint()
        {
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(8, 1), out var waypoints, out var total), Is.True);
            Assert.That(waypoints, Is.EqualTo(new[] { new Vector2Int(8, 1) }));
            Assert.That(total, Is.EqualTo(14f).Within(0.001f));
        }

        [Test]
        public void ADirectionChangeKeepsTheTurnAsAWaypoint()
        {
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(8, 4), out var waypoints, out _), Is.True);
            Assert.That(waypoints.Count, Is.EqualTo(2)); // one diagonal run, then one straight run
            Assert.That(waypoints.Last(), Is.EqualTo(new Vector2Int(8, 4)));
        }

        [Test]
        public void PrefersACheaperRoadDetourWithinReason()
        {
            // A cost-1 road runs along y = 5 from x = 1 to 10 while the direct line along y = 1 is cost-2 grass.
            for (var x = 0; x < Size; x++) _costs[x, 5] = 1;
            for (var y = 1; y <= 5; y++) { _costs[1, y] = 1; _costs[10, y] = 1; }
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(10, 1), out var waypoints, out var total), Is.True);
            Assert.That(waypoints.Any(cell => cell.y == 5), Is.True, "should use the road");
            Assert.That(total, Is.LessThan(17f)); // the grass line costs 8 * 2 + 1
        }

        [Test]
        public void TakesTheShortWayWhenTheDetourIsTooLong()
        {
            // Road only along y = 11, far away.
            for (var x = 0; x < Size; x++) _costs[x, 11] = 1;
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(10, 1), out var waypoints, out var total), Is.True);
            Assert.That(waypoints, Is.EqualTo(new[] { new Vector2Int(10, 1) }));
            Assert.That(total, Is.EqualTo(18f).Within(0.001f));
        }

        [Test]
        public void AvoidsBlockedCells()
        {
            Block(x: 5, yFrom: 0, yTo: 9); // wall with a gap at y = 10..11
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(9, 1), out var waypoints, out _), Is.True);
            Assert.That(waypoints.Any(cell => cell.y >= 10), Is.True);
        }

        [Test]
        public void DiagonalsDoNotCutCorners()
        {
            // Two blocked cells touch diagonally; stepping between them would clip both corners.
            _costs[4, 4] = 0;
            _costs[5, 5] = 0;
            Assert.That(Find(new Vector2Int(5, 4), new Vector2Int(4, 5), out var waypoints, out var total), Is.True);
            Assert.That(total, Is.GreaterThan(2f * Mathf.Sqrt(2f))); // no diagonal squeeze between the blocks
            Assert.That(waypoints.Count, Is.GreaterThan(1));
        }

        [Test]
        public void UnreachableGoalFails()
        {
            for (var x = 6; x <= 8; x++)
                for (var y = 6; y <= 8; y++)
                    if (x != 7 || y != 7) _costs[x, y] = 0;
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(7, 7), out _, out _), Is.False);
        }

        [Test]
        public void BlockedGoalAndOutOfBoundsFail()
        {
            _costs[4, 4] = 0;
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(4, 4), out _, out _), Is.False);
            Assert.That(Find(new Vector2Int(1, 1), new Vector2Int(40, 4), out _, out _), Is.False);
        }

        private bool Find(Vector2Int start, Vector2Int goal, out List<Vector2Int> waypoints, out float total) =>
            GridPathfinder.TryFindPath(start, goal, Bounds, Cost, out waypoints, out total);

        private bool Cost(Vector2Int cell, out int cost)
        {
            cost = _costs[cell.x, cell.y];
            return cost > 0;
        }

        private void Block(int x, int yFrom, int yTo)
        {
            for (var y = yFrom; y <= yTo; y++) _costs[x, y] = 0;
        }
    }
}
