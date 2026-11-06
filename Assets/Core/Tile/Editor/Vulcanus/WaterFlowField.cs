using System;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>A freehand current in body-local logical pixels: water enters at the first point and leaves at the last.</summary>
    internal readonly struct FlowStrokeData
    {
        internal readonly Vector2[] Points;
        /// <summary>Radius, in pixels, within which the stroke's direction guides the current.</summary>
        internal readonly float Width;
        /// <summary>Relative speed; 1 is the profile's flow speed.</summary>
        internal readonly float Speed;

        internal FlowStrokeData(Vector2[] points, float width, float speed)
        {
            Points = points;
            Width = width;
            Speed = speed;
        }
    }

    internal readonly struct FlowResult
    {
        internal readonly byte[] Bytes;
        /// <summary>Largest relative speed in the field; blue encodes speed as a fraction of it.</summary>
        internal readonly float SpeedScale;

        internal FlowResult(byte[] bytes, float speedScale)
        {
            Bytes = bytes;
            SpeedScale = speedScale;
        }
    }

    /// <summary>
    /// Derives a water body's currents from its drawn strokes and its shape. A potential is solved through the
    /// water from the strokes' starts (1) to their ends (0) with banks as walls, so currents follow channels and
    /// bends parallel to the banks and side bays stay nearly still. Near a stroke, the current is pulled towards
    /// the stroke's own direction. Output uses the encoding documented for WaterProfile.flowMap.
    /// </summary>
    internal static class WaterFlowField
    {
        /// <summary>Distance from land (logical pixels) at which water reaches full speed.</summary>
        internal const int ShoreRamp = 8;
        private const float BankSpeed = 0.4f;
        // The potential is smooth, so it is solved on coarse cells and read back per pixel.
        private const int Cell = 4;
        private const double Tolerance = 1e-7;
        private const int MaximumSweeps = 20000;

        /// <param name="water">Body pixels over a width×height grid whose lower-left is <paramref name="origin"/>.</param>
        /// <param name="shore">Distance from land per grid pixel, capped at <see cref="ShoreRamp"/> or more.</param>
        /// <param name="strokes">Strokes in absolute logical pixels; a pixel index i covers [i, i + 1).</param>
        internal static FlowResult Compute(bool[] water, float[] shore, Vector2Int origin, int width, int height,
            IReadOnlyList<FlowStrokeData> strokes, string bodyName)
        {
            var cols = (width + Cell - 1) / Cell;
            var rows = (height + Cell - 1) / Cell;
            var wet = new bool[cols * rows];
            for (var i = 0; i < water.Length; i++)
                if (water[i]) wet[i / width / Cell * cols + i % width / Cell] = true;

            var isInlet = new bool[wet.Length];
            var isOutlet = new bool[wet.Length];
            var speedScale = 1f;
            for (var s = 0; s < strokes.Count; s++)
            {
                speedScale = Mathf.Max(speedScale, strokes[s].Speed);
                var points = strokes[s].Points;
                // A stroke that starts or ends on another stroke joins it (a tributary); only free ends are sources and sinks.
                if (!OnAnotherStroke(points[0], s, strokes))
                    MarkCells(isInlet, wet, points[0], strokes[s], origin, cols, rows, bodyName, s, "starts");
                if (!OnAnotherStroke(points[points.Length - 1], s, strokes))
                    MarkCells(isOutlet, wet, points[points.Length - 1], strokes[s], origin, cols, rows, bodyName, s, "ends");
            }
            if (!Array.Exists(isInlet, flag => flag) || !Array.Exists(isOutlet, flag => flag))
                throw new InvalidOperationException($"Water body '{bodyName}' currents have no free start or no free end: every stroke end lies on another stroke.");
            for (var c = 0; c < wet.Length; c++) isInlet[c] &= !isOutlet[c];

            var reached = Reachable(wet, cols, rows, isOutlet);
            var inletReached = false;
            for (var c = 0; c < wet.Length; c++) inletReached |= isInlet[c] && reached[c];
            if (!inletReached)
                throw new InvalidOperationException($"Water body '{bodyName}' currents start in water that is not connected to where they end.");

            var flow = Smooth(Current(Solve(reached, isInlet, isOutlet, cols, rows, bodyName), reached, cols, rows), reached, cols, rows);
            var magnitudes = new List<float>();
            for (var c = 0; c < flow.Length; c++) if (reached[c]) magnitudes.Add(flow[c].magnitude);
            magnitudes.Sort();
            // Backwater with almost no potential drop is slow; the main current and narrows run full speed.
            var reference = magnitudes[(int)((magnitudes.Count - 1) * 0.8f)];

            var bytes = new byte[water.Length * 3];
            for (var i = 0; i < water.Length; i++)
            {
                var r = (byte)128;
                var g = (byte)128;
                byte b = 0;
                if (water[i])
                {
                    var x = i % width;
                    var y = i / width;
                    var cell = y / Cell * cols + x / Cell;
                    var direction = Vector2.zero;
                    var current = 0f;
                    if (reached[cell] && flow[cell].sqrMagnitude > 0 && reference > 0)
                    {
                        direction = flow[cell].normalized;
                        current = Mathf.Min(1, flow[cell].magnitude / reference);
                    }
                    var pull = Pull(new Vector2(origin.x + x + 0.5f, origin.y + y + 0.5f), strokes, out var guide, out var guideSpeed);
                    if (pull > 0)
                    {
                        direction = direction * (1 - pull) + guide * pull;
                        current = Mathf.Lerp(current, 1, pull) * Mathf.Lerp(1, guideSpeed, pull);
                    }
                    if (direction.sqrMagnitude > 1e-6f && current > 0)
                    {
                        direction.Normalize();
                        r = (byte)Mathf.RoundToInt(128 + direction.x * 127);
                        g = (byte)Mathf.RoundToInt(128 + direction.y * 127);
                        b = (byte)Mathf.RoundToInt(Mathf.Lerp(BankSpeed, 1, Mathf.Clamp01(shore[i] / ShoreRamp)) * Mathf.Clamp01(current / speedScale) * 255);
                    }
                }
                bytes[i * 3] = r;
                bytes[i * 3 + 1] = g;
                bytes[i * 3 + 2] = b;
            }
            return new FlowResult(bytes, speedScale);
        }

        private static bool OnAnotherStroke(Vector2 point, int self, IReadOnlyList<FlowStrokeData> strokes)
        {
            for (var s = 0; s < strokes.Count; s++)
                if (s != self && DistanceToStroke(point, strokes[s], out _) < strokes[s].Width) return true;
            return false;
        }

        // Marks the water cells within the stroke's reach of a free end; an end with no water nearby was drawn on land.
        private static void MarkCells(bool[] target, bool[] wet, Vector2 point, FlowStrokeData stroke, Vector2Int origin,
            int cols, int rows, string bodyName, int index, string verb)
        {
            var radius = Mathf.Max(Cell, stroke.Width * 0.5f);
            var found = false;
            for (var cy = 0; cy < rows; cy++)
                for (var cx = 0; cx < cols; cx++)
                {
                    if (!wet[cy * cols + cx]) continue;
                    var centre = new Vector2(origin.x + cx * Cell + Cell * 0.5f, origin.y + cy * Cell + Cell * 0.5f);
                    if ((centre - point).sqrMagnitude > radius * radius) continue;
                    target[cy * cols + cx] = true;
                    found = true;
                }
            if (!found)
                throw new InvalidOperationException($"Water body '{bodyName}' current {index + 1} {verb} on land: no water within {radius:0.#} pixels of ({point.x:0.#}, {point.y:0.#}).");
        }

        // Nearest point on the stroke's line; `tangent` is the unit direction of the segment it lies on.
        private static float DistanceToStroke(Vector2 p, FlowStrokeData stroke, out Vector2 tangent)
        {
            var best = float.MaxValue;
            tangent = Vector2.zero;
            var points = stroke.Points;
            for (var i = 1; i < points.Length; i++)
            {
                var a = points[i - 1];
                var segment = points[i] - a;
                var lengthSquared = segment.sqrMagnitude;
                var t = lengthSquared == 0 ? 0 : Mathf.Clamp01(Vector2.Dot(p - a, segment) / lengthSquared);
                var distance = (p - (a + segment * t)).magnitude;
                if (distance >= best) continue;
                best = distance;
                tangent = lengthSquared == 0 ? Vector2.zero : segment / Mathf.Sqrt(lengthSquared);
            }
            return best;
        }

        // How strongly the strokes steer the water here (1 on a line, 0 at its reach), and where they point.
        private static float Pull(Vector2 p, IReadOnlyList<FlowStrokeData> strokes, out Vector2 direction, out float speed)
        {
            var strongest = 0f;
            direction = Vector2.zero;
            speed = 1;
            for (var s = 0; s < strokes.Count; s++)
            {
                var distance = DistanceToStroke(p, strokes[s], out var tangent);
                var pull = 1 - distance / strokes[s].Width;
                if (pull <= strongest) continue;
                strongest = pull;
                direction = tangent;
                speed = strokes[s].Speed;
            }
            return strongest;
        }

        // Wet cells connected to the outlet; the rest cannot carry a current to it.
        private static bool[] Reachable(bool[] wet, int cols, int rows, bool[] outlet)
        {
            var reached = new bool[wet.Length];
            var pending = new Stack<int>();
            for (var c = 0; c < wet.Length; c++)
                if (outlet[c]) { reached[c] = true; pending.Push(c); }
            while (pending.Count > 0)
            {
                var c = pending.Pop();
                var x = c % cols;
                var y = c / cols;
                foreach (var next in Neighbours(c, x, y, cols, rows))
                    if (wet[next] && !reached[next]) { reached[next] = true; pending.Push(next); }
            }
            return reached;
        }

        private static IEnumerable<int> Neighbours(int c, int x, int y, int cols, int rows)
        {
            if (x > 0) yield return c - 1;
            if (x < cols - 1) yield return c + 1;
            if (y > 0) yield return c - cols;
            if (y < rows - 1) yield return c + cols;
        }

        // Successive over-relaxation of the Laplace equation: each interior cell tends to the mean of its
        // water neighbours, so banks are zero-flux walls.
        private static double[] Solve(bool[] reached, bool[] inlet, bool[] outlet, int cols, int rows, string bodyName)
        {
            var phi = new double[reached.Length];
            for (var c = 0; c < phi.Length; c++) phi[c] = inlet[c] ? 1 : outlet[c] ? 0 : 0.5;
            var omega = 2 / (1 + Math.Sin(Math.PI / (Math.Max(cols, rows) + 1)));
            var free = new List<int>();
            for (var c = 0; c < phi.Length; c++) if (reached[c] && !inlet[c] && !outlet[c]) free.Add(c);
            for (var sweep = 0; sweep < MaximumSweeps; sweep++)
            {
                var change = 0.0;
                foreach (var c in free)
                {
                    var sum = 0.0;
                    var count = 0;
                    foreach (var next in Neighbours(c, c % cols, c / cols, cols, rows))
                        if (reached[next]) { sum += phi[next]; count++; }
                    var delta = omega * (sum / count - phi[c]);
                    phi[c] += delta;
                    change = Math.Max(change, Math.Abs(delta));
                }
                if (change < Tolerance) return phi;
            }
            throw new InvalidOperationException($"Water body '{bodyName}' flow potential did not converge in {MaximumSweeps} sweeps.");
        }

        // Current is down the potential; one-sided differences keep banks from leaking across.
        private static Vector2[] Current(double[] phi, bool[] reached, int cols, int rows)
        {
            var flow = new Vector2[phi.Length];
            for (var c = 0; c < phi.Length; c++)
            {
                if (!reached[c]) continue;
                var x = c % cols;
                var y = c / cols;
                flow[c] = new Vector2(-Derivative(phi, c, x > 0 && reached[c - 1], x < cols - 1 && reached[c + 1], 1),
                    -Derivative(phi, c, y > 0 && reached[c - cols], y < rows - 1 && reached[c + cols], cols));
            }
            return flow;
        }

        private static float Derivative(double[] phi, int c, bool before, bool after, int step)
        {
            if (before && after) return (float)((phi[c + step] - phi[c - step]) / 2);
            if (after) return (float)(phi[c + step] - phi[c]);
            return before ? (float)(phi[c] - phi[c - step]) : 0;
        }

        // One 3×3 average over connected water hides the grid's blockiness.
        private static Vector2[] Smooth(Vector2[] flow, bool[] reached, int cols, int rows)
        {
            var result = new Vector2[flow.Length];
            for (var c = 0; c < flow.Length; c++)
            {
                if (!reached[c]) continue;
                var sum = Vector2.zero;
                var count = 0;
                for (var y = Math.Max(0, c / cols - 1); y <= Math.Min(rows - 1, c / cols + 1); y++)
                    for (var x = Math.Max(0, c % cols - 1); x <= Math.Min(cols - 1, c % cols + 1); x++)
                        if (reached[y * cols + x]) { sum += flow[y * cols + x]; count++; }
                result[c] = sum / count;
            }
            return result;
        }
    }
}
