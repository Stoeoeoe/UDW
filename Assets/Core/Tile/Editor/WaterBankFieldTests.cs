using System;
using System.Collections.Generic;
using System.Linq;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEngine;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class WaterBankFieldTests
    {
        private const int Size = 40;
        private static readonly Color32 Red = new(255, 0, 0, 255);
        private static readonly Color32 Green = new(0, 255, 0, 255);
        private static readonly Color32 Blue = new(0, 0, 255, 255);

        // Bodies are filled rectangles (inclusive corners); everything else is eligible land.
        private static (byte[] bodyAt, bool[] land) World(params (byte value, int x0, int y0, int x1, int y1)[] bodies)
        {
            var bodyAt = new byte[Size * Size];
            foreach (var (value, x0, y0, x1, y1) in bodies)
                for (var y = y0; y <= y1; y++)
                    for (var x = x0; x <= x1; x++) bodyAt[y * Size + x] = value;
            return (bodyAt, bodyAt.Select(v => v == 0).ToArray());
        }

        private static BankLayerData Band(float start, float end, Color32 color, float coverageStart = 1, float coverageEnd = 1) =>
            new() { Kind = BankLayerKind.Band, Start = start, End = end, Color = color, CoverageStart = coverageStart, CoverageEnd = coverageEnd };

        private static BankLayerData Strip(int width, int height, Color32[] pixels) =>
            new() { Kind = BankLayerKind.Strip, Pixels = pixels, Width = width, Height = height, CoverageStart = 1, CoverageEnd = 1 };

        private static BankProfileData Profile(params BankLayerData[] layers) => new()
        {
            Layers = layers,
            Depth = Mathf.CeilToInt(layers.Max(layer => layer.Kind == BankLayerKind.Strip ? layer.Height : layer.End)),
            EdgeNoiseScale = 8
        };

        private static Dictionary<byte, Color32[]> Compute((byte[] bodyAt, bool[] land) world, params (byte value, BankProfileData profile)[] profiles) =>
            WaterBankField.Compute(world.bodyAt, world.land, Vector2Int.zero, Size, Size, profiles.ToDictionary(p => p.value, p => p.profile));

        private static Color32 At(Dictionary<byte, Color32[]> result, byte body, int x, int y) =>
            result.TryGetValue(body, out var pixels) ? pixels[y * Size + x] : default;

        [Test]
        public void BandsColourLandByDistanceFromTheWater()
        {
            var result = Compute(World((1, 10, 10, 29, 29)), (1, Profile(Band(0, 1, Red), Band(1, 3, Green))));
            Assert.That(At(result, 1, 9, 20), Is.EqualTo(Red), "The first land pixel is at depth 0.");
            Assert.That(At(result, 1, 8, 20), Is.EqualTo(Green));
            Assert.That(At(result, 1, 7, 20), Is.EqualTo(Green));
            Assert.That(At(result, 1, 6, 20).a, Is.Zero, "Beyond the last band there is no bank.");
            Assert.That(At(result, 1, 15, 15).a, Is.Zero, "Water itself is not bank.");
            Assert.That(At(result, 1, 9, 9), Is.EqualTo(Red), "A corner pixel is under a pixel away from the water.");
        }

        [Test]
        public void BanksNeverCoverPixelsThatAreNotLand()
        {
            var (bodyAt, land) = World((1, 10, 10, 29, 29));
            for (var y = 0; y < Size; y++)
                for (var x = 0; x < 8; x++) land[y * Size + x] = false; // E.g. outside the map or other water.
            var result = Compute((bodyAt, land), (1, Profile(Band(0, 4, Red))));
            Assert.That(At(result, 1, 8, 20), Is.EqualTo(Red));
            Assert.That(At(result, 1, 7, 20).a, Is.Zero);
        }

        [Test]
        public void EachLandPixelBelongsToTheNearestBody()
        {
            var world = World((1, 5, 10, 10, 29), (2, 20, 10, 25, 29));
            var result = Compute(world, (1, Profile(Band(0, 10, Red))), (2, Profile(Band(0, 10, Green))));
            Assert.That(At(result, 1, 12, 20), Is.EqualTo(Red));
            Assert.That(At(result, 1, 14, 20), Is.EqualTo(Red));
            Assert.That(At(result, 2, 16, 20), Is.EqualTo(Green), "Nearer to the second body, so it is the second body's bank.");
            Assert.That(At(result, 2, 18, 20), Is.EqualTo(Green));
            Assert.That(At(result, 1, 16, 20).a, Is.Zero);
        }

        [Test]
        public void ABodyWithoutABankStillKeepsOtherBanksOffItsShore()
        {
            var world = World((1, 5, 10, 10, 29), (2, 20, 10, 25, 29));
            var result = Compute(world, (1, Profile(Band(0, 12, Red))));
            Assert.That(At(result, 1, 14, 20), Is.EqualTo(Red));
            Assert.That(At(result, 1, 16, 20).a, Is.Zero, "That pixel is nearer to the body that has no bank.");
        }

        [Test]
        public void ReducedCoverageDithersInsteadOfBlending()
        {
            var result = Compute(World((1, 0, 0, 9, 39)), (1, Profile(Band(0, 10, Red, 0.5f, 0.5f))));
            var covered = 0;
            for (var y = 0; y < Size; y++)
                for (var x = 10; x < 20; x++)
                {
                    var color = At(result, 1, x, y);
                    if (color.a == 0) continue;
                    Assert.That(color, Is.EqualTo(Red), "Dithering draws the palette colour or nothing.");
                    covered++;
                }
            Assert.That(covered / (10f * Size), Is.InRange(0.45f, 0.55f));
        }

        [Test]
        public void ACoverageThatFadesToNothingFallsThroughToTheNextLayer()
        {
            var result = Compute(World((1, 0, 0, 9, 39)),
                (1, Profile(Band(0, 10, Red, 1, 0), Band(0, 10, Green))));
            var redNear = 0;
            var redFar = 0;
            for (var y = 0; y < Size; y++)
            {
                if (At(result, 1, 10, y).Equals(Red)) redNear++;
                if (At(result, 1, 19, y).Equals(Red)) redFar++;
                Assert.That(At(result, 1, 19, y).a, Is.EqualTo(255), "Missed pixels are filled by the layer behind.");
            }
            Assert.That(redNear, Is.GreaterThan(redFar));
        }

        [Test]
        public void ABandEdgeWandersWithNoiseButStaysInRange()
        {
            var profile = Profile(Band(0, 6, Red));
            profile.EdgeNoise = 2;
            var result = Compute(World((1, 0, 0, 9, 39)), (1, profile));
            var edges = new HashSet<int>();
            for (var y = 0; y < Size; y++)
            {
                var x = 10;
                while (x < Size && At(result, 1, x, y).a != 0) x++;
                edges.Add(x);
            }
            Assert.That(edges.Count, Is.GreaterThan(1), "The edge is not a straight copy of the shoreline.");
            Assert.That(edges.Min(), Is.GreaterThanOrEqualTo(10 + 4 - 1));
            Assert.That(edges.Max(), Is.LessThanOrEqualTo(10 + 8 + 1));
        }

        private static Dictionary<byte, Color32[]> ComputeWithShallows(float coverage)
        {
            var profile = Profile(Band(0, 2, Red));
            profile.ShallowPixels = 3;
            profile.ShallowColor = Green;
            profile.ShallowCoverage = coverage;
            return Compute(World((1, 10, 10, 29, 29), (2, 32, 10, 37, 29)), (1, profile));
        }

        private static int Covered(Dictionary<byte, Color32[]> result, int x) =>
            Enumerable.Range(12, 16).Count(y => At(result, 1, x, y).a != 0);

        [Test]
        public void ShallowsCreepIntoTheWaterOnlyAsFarAsTheyReach()
        {
            var result = ComputeWithShallows(1);
            Assert.That(Covered(result, 10), Is.EqualTo(16), "The water pixel against the shore is fully covered.");
            Assert.That(Covered(result, 12), Is.GreaterThan(0), "Two pixels out is still inside the creep.");
            Assert.That(Covered(result, 13), Is.Zero, "Past the creep the water is left alone.");
            Assert.That(At(result, 1, 10, 20), Is.EqualTo(Green));
            Assert.That(At(result, 1, 20, 20).a, Is.Zero, "Open water is not touched.");
            Assert.That(At(result, 1, 9, 20), Is.EqualTo(Red), "Land still takes the bands.");
            Assert.That(result.ContainsKey(2), Is.False, "A body with no bank creeps nowhere.");
        }

        [Test]
        public void ShallowsDitherInsteadOfBlending()
        {
            var result = ComputeWithShallows(0.5f);
            Assert.That(Covered(result, 10), Is.InRange(1, 15), "Half coverage leaves gaps.");
            for (var x = 10; x < 13; x++)
                for (var y = 12; y < 28; y++)
                    Assert.That(At(result, 1, x, y).a == 0 || At(result, 1, x, y).Equals(Green), Is.True, "A pixel is the palette colour or nothing.");
            Assert.That(Covered(result, 10) + Covered(result, 11) + Covered(result, 12), Is.GreaterThan(Covered(result, 12) * 3 - 1),
                "Coverage thins out with distance from the shore.");
        }

        [Test]
        public void TransparencyFadesAlphaWithoutLeavingGaps()
        {
            var profile = Profile(Band(0, 10, Red, 1, 0), Band(0, 10, Green));
            profile.FadeWithTransparency = true;
            profile.EdgeNoise = 0;
            profile.ShallowPixels = 3;
            profile.ShallowColor = Blue;
            profile.ShallowCoverage = 0.5f;
            var result = Compute(World((1, 0, 0, 9, 39)), (1, profile));
            for (var y = 12; y < 28; y++)
            {
                var near = At(result, 1, 10, y);
                var far = At(result, 1, 18, y);
                Assert.That(near, Is.EqualTo(new Color32(255, 0, 0, 255)), "At the shore the first layer is fully opaque.");
                Assert.That(far.r, Is.EqualTo(255));
                Assert.That(far.a, Is.InRange(1, 254), "Further out it is a smooth fade, with no pixel missing.");
                Assert.That(At(result, 1, 19, y).a, Is.LessThan(far.a), "And it keeps fading with distance.");
                // The creep into the water fades too: half transparent against the shore, then clearer.
                Assert.That(At(result, 1, 8, y).b, Is.EqualTo(255));
                Assert.That(At(result, 1, 8, y).a, Is.InRange(1, 128));
            }
        }

        [Test]
        public void DitherStrengthAddsTextureToATransparencyFade()
        {
            int DistinctAlphas(float strength)
            {
                var profile = Profile(Band(0, 10, Red, 0.5f, 0.5f));
                profile.FadeWithTransparency = true;
                profile.DitherStrength = strength;
                var result = Compute(World((1, 0, 0, 9, 39)), (1, profile));
                var alphas = new HashSet<int>();
                for (var y = 0; y < Size; y++)
                    for (var x = 10; x < 14; x++) alphas.Add(At(result, 1, x, y).a);
                return alphas.Count;
            }
            Assert.That(DistinctAlphas(0), Is.EqualTo(1), "No dither: every pixel at the same coverage has the same opacity.");
            Assert.That(DistinctAlphas(0.4f), Is.GreaterThan(4), "A little dither varies the opacity in a pattern.");
        }

        [Test]
        public void TheCreepIntoTheWaterStaysSmoothEvenWhenTheLandFadeIsDithered()
        {
            var profile = Profile(Band(0, 4, Red, 0.5f, 0.5f));
            profile.FadeWithTransparency = true;
            profile.DitherStrength = 0.6f;
            profile.ShallowPixels = 3;
            profile.ShallowColor = Blue;
            profile.ShallowCoverage = 0.8f;
            var result = Compute(World((1, 0, 0, 9, 39)), (1, profile));
            var water = new HashSet<int>();
            var land = new HashSet<int>();
            for (var y = 0; y < Size; y++)
            {
                water.Add(At(result, 1, 9, y).a); // The water pixel against the shore.
                land.Add(At(result, 1, 10, y).a);
            }
            Assert.That(water.Count, Is.EqualTo(1), "Underwater soil is a smooth fade: the same opacity all along the shore.");
            Assert.That(land.Count, Is.GreaterThan(3), "The bank on land carries the dither texture.");
        }

        [Test]
        public void NoShallowsMeansTheBankStaysOnLand()
        {
            var result = Compute(World((1, 10, 10, 29, 29)), (1, Profile(Band(0, 2, Red))));
            Assert.That(At(result, 1, 10, 20).a, Is.Zero);
        }

        [Test]
        public void AStripPutsItsTopRowAgainstTheWater()
        {
            // Rows from the bottom of the texture: blue, green, red. Every column is the same.
            var pixels = new Color32[4 * 3];
            for (var x = 0; x < 4; x++) { pixels[x] = Blue; pixels[4 + x] = Green; pixels[8 + x] = Red; }
            var result = Compute(World((1, 10, 10, 29, 29)), (1, Profile(Strip(4, 3, pixels))));
            Assert.That(At(result, 1, 9, 20), Is.EqualTo(Red));
            Assert.That(At(result, 1, 8, 20), Is.EqualTo(Green));
            Assert.That(At(result, 1, 7, 20), Is.EqualTo(Blue));
            Assert.That(At(result, 1, 6, 20).a, Is.Zero, "A strip reaches as far as it is tall.");
        }

        [Test]
        public void AStripRepeatsAlongTheShore()
        {
            // One row of four different colours. The square's shoreline is 80 pixels long: a whole 20 repeats.
            var colors = new[] { Red, Green, Blue, new Color32(255, 255, 0, 255) };
            var result = Compute(World((1, 10, 10, 29, 29)), (1, Profile(Strip(4, 1, colors))));
            var left = Enumerable.Range(12, 8).Select(y => At(result, 1, 9, y)).ToArray();
            Assert.That(left.Take(4).Distinct().Count(), Is.EqualTo(4), "Neighbouring shore pixels walk through the strip.");
            Assert.That(left.Skip(4), Is.EqualTo(left.Take(4)), "And it repeats every strip width.");
            var top = Enumerable.Range(12, 8).Select(x => At(result, 1, x, 30)).ToArray();
            Assert.That(top.Take(4).Distinct().Count(), Is.EqualTo(4));
            Assert.That(top.Skip(4), Is.EqualTo(top.Take(4)));
        }

        [Test]
        public void StripArtFollowsAnIslandsShoreToo()
        {
            var (bodyAt, land) = World((1, 10, 10, 29, 29));
            for (var y = 18; y <= 21; y++)
                for (var x = 18; x <= 21; x++) { bodyAt[y * Size + x] = 0; land[y * Size + x] = true; } // An island.
            var result = Compute((bodyAt, land), (1, Profile(Strip(4, 2, Enumerable.Repeat(Red, 8).ToArray()))));
            // The island is land, so its rim is the bank: two rows deep from each side.
            Assert.That(At(result, 1, 18, 19), Is.EqualTo(Red), "The island's own shoreline carries the bank.");
            Assert.That(At(result, 1, 19, 19), Is.EqualTo(Red));
            Assert.That(At(result, 1, 21, 19), Is.EqualTo(Red), "And the far side of the island, from the water on its other side.");
            Assert.That(At(result, 1, 17, 19).a, Is.Zero, "Water beside the island is not bank.");
        }

        [Test]
        public void AClosedShorelineHoldsAWholeNumberOfRepeatsAndAnOpenOneIsLeftAlone()
        {
            // A 70-edge loop stretches to 18 repeats of a 4-wide strip, so the art meets itself at the seam.
            Assert.That(WaterBankField.StripCoordinate(70, 70, 4) % 4, Is.EqualTo(WaterBankField.StripCoordinate(0, 70, 4) % 4).Within(1e-4));
            Assert.That(WaterBankField.StripCoordinate(35, 70, 4), Is.EqualTo(36).Within(1e-4));
            Assert.That(WaterBankField.StripCoordinate(35, 0, 4), Is.EqualTo(35), "An open shoreline keeps its true length.");
        }

        [Test]
        public void ShorelineAlongTheMapEdgeIsAnOpenChain()
        {
            // Water runs off the left, top and bottom of the grid, so its only shoreline is the open line at x = 10.
            var (bodyAt, land) = World((1, 0, 0, 9, 39));
            var shore = ShoreCoordinates.Build(bodyAt, land, 1, Size, Size);
            Assert.That(shore.TryNearest(10, 20, 2, out var along, out var loop), Is.True);
            Assert.That(loop, Is.Zero, "The map border is not a shore, so the chain is not closed.");
            Assert.That(along, Is.InRange(0.5f, 40f));
        }
    }
}
