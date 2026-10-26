using System;
using Character;
using UnityEngine;

namespace Core.Scripting
{
    /// <summary>Walks each authored segment using the same movement and collision checks as MoveTo.</summary>
    public sealed class WalkPathAction : ILuaAction
    {
        private readonly GameCharacter character;
        private readonly Vector2[] points;
        private MoveToAction move;
        private int index;
        private bool disposed;
        public bool IsCompleted => index == points.Length;

        public WalkPathAction(GameCharacter character, Vector2[] points)
        {
            if (!character) throw new ArgumentNullException(nameof(character));
            if (points == null || points.Length == 0)
                throw new ArgumentException("A walking path requires at least one position.", nameof(points));
            foreach (var point in points)
                if (!float.IsFinite(point.x) || !float.IsFinite(point.y))
                    throw new ArgumentException("Walking path positions must be finite.", nameof(points));
            this.character = character;
            this.points = (Vector2[])points.Clone();
            move = new MoveToAction(character, points[0]);
        }

        public void Tick(float deltaTime)
        {
            if (disposed) throw new ObjectDisposedException(nameof(WalkPathAction));
            while (!IsCompleted)
            {
                try { move.Tick(deltaTime); }
                catch (InvalidOperationException error)
                {
                    throw new InvalidOperationException($"Walk path waypoint {index + 1}/{points.Length} " +
                        $"(world {points[index].ToString("F3")}): {error.Message}", error);
                }
                if (!move.IsCompleted) return;
                move.Dispose();
                move = null;
                index++;
                if (!IsCompleted) move = new MoveToAction(character, points[index]);
            }
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            move?.Dispose(); // No segment remains after the final point.
        }
    }
}
