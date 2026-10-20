using System;
using System.IO;
using Core.Tile.Editor.Vulcanus;
using Core.Tile.Water;
using NUnit.Framework;
using UnityEngine;

namespace Core.Tile.Editor
{
    [Category("MapLoading")]
    public sealed class WaterShorelineTests
    {
        [Test]
        public void EuclideanFieldMatchesNearestLandIncludingDiagonalCornersAndNarrowChannels()
        {
            const int width = 19, height = 13, range = 8;
            var random = new System.Random(734);
            var land = new byte[width * height];
            for (var i = 0; i < land.Length; i++) land[i] = (byte)(random.Next(6) == 0 ? 1 : 0);
            var distances = WaterShorelineBuilder.Distances(land, width, height, range);
            for (var y = 0; y < height; y++)
                for (var x = 0; x < width; x++)
                {
                    var expected = (float)range;
                    for (var sy = 0; sy < height; sy++)
                        for (var sx = 0; sx < width; sx++)
                            if (land[sy * width + sx] != 0)
                            {
                                var dx = Mathf.Max(0, Mathf.Abs(x - sx) - 0.5f);
                                var dy = Mathf.Max(0, Mathf.Abs(y - sy) - 0.5f);
                                expected = Mathf.Min(expected, Mathf.Sqrt(dx * dx + dy * dy));
                            }
                    Assert.That(distances[y * width + x], Is.EqualTo(expected).Within(0.0001f), $"Pixel {x},{y}");
                }
        }

        [Test]
        public void InternalIslandHasPixelAccurateDistancesAndOpenWaterSaturatesAtTheRange()
        {
            var land = new byte[81];
            land[4 * 9 + 4] = 1;
            var field = WaterShorelineBuilder.Distances(land, 9, 9, 3);
            Assert.That(field[4 * 9 + 5], Is.EqualTo(0.5f));
            Assert.That(field[5 * 9 + 5], Is.EqualTo(Mathf.Sqrt(0.5f)).Within(0.0001));
            Assert.That(field[0], Is.EqualTo(3));
            Assert.That(WaterShorelineBuilder.Distances(new byte[81], 9, 9, 3), Is.All.EqualTo(3));
        }

        [Test]
        public void PaddedChunksAgreeAcrossTheirJoinAndUnchangedChunksReuseTheCache()
        {
            const int range = 13;
            const int size = WaterShorelineData.ChunkSize;
            var length = size + 2 * range;
            float[] Chunk(int origin)
            {
                var land = new byte[length * length];
                for (var y = 0; y < length; y++)
                    for (var x = 0; x < length; x++)
                        land[y * length + x] = (byte)(x + origin - range <= size - 3 ? 1 : 0);
                var first = WaterShorelineBuilder.CachedChunk(land, range);
                var path = WaterShorelineBuilder.CachePath(land, range);
                var timestamp = File.GetLastWriteTimeUtc(path);
                try
                {
                    var marker = new DateTime(2001, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                    File.SetLastWriteTimeUtc(path, marker);
                    Assert.That(WaterShorelineBuilder.CachedChunk(land, range), Is.EqualTo(first));
                    Assert.That(File.GetLastWriteTimeUtc(path), Is.EqualTo(marker), "Appearance-only edits must not regenerate unchanged distances.");
                }
                finally { File.SetLastWriteTimeUtc(path, timestamp); }
                return first;
            }
            var left = Chunk(0);
            var right = Chunk(size);
            for (var y = 0; y < size; y++)
            {
                Assert.That(left[y * size + size - 1], Is.EqualTo(1.5f));
                Assert.That(right[y * size], Is.EqualTo(2.5f));
            }
        }
    }
}
