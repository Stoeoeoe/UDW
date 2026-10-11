using System;
using System.IO;
using Core.Tile.Vulcanus;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.U2D.Aseprite;
using UnityEngine;

namespace Core.Tile.Editor
{
    public sealed class VulcanusAsepriteTilesetTests
    {
        [Test]
        public void ReferencedAsepriteRetainsTileCoordinatesAndTransparentCells()
        {
            var folder = "Assets/__AseTilesetTest_" + Guid.NewGuid().ToString("N");
            AssetDatabase.CreateFolder("Assets", Path.GetFileName(folder));
            try
            {
                var sheetPath = folder + "/sheet.aseprite";
                File.WriteAllBytes(sheetPath, CreateSheet());
                AssetDatabase.ImportAsset(sheetPath, ImportAssetOptions.ForceSynchronousImport);
                var importer = (AsepriteImporter)AssetImporter.GetAtPath(sheetPath);
                Assert.That(importer.importMode, Is.EqualTo(FileImportModes.AnimatedSprite),
                    "Unreferenced character/animation sheets must retain their import settings.");

                var tilesetPath = folder + "/tiles.vts";
                File.WriteAllText(tilesetPath, "{\"id\":\"test:sheet\",\"spriteSheet\":\"sheet.aseprite\",\"columns\":2,\"tileCount\":4}");
                AssetDatabase.ImportAsset(sheetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
                AssetDatabase.ImportAsset(tilesetPath, ImportAssetOptions.ForceSynchronousImport);
                var tileset = AssetDatabase.LoadAssetAtPath<VulcanusTilesetAsset>(tilesetPath);
                Assert.That(tileset, Is.Not.Null);
                Assert.That(tileset.SpriteSheet.width, Is.EqualTo(32));
                Assert.That(tileset.SpriteSheet.height, Is.EqualTo(32));
                Assert.That(tileset.SpriteSheet.isReadable, Is.True);
                Assert.That(tileset.Tiles[0].sprite, Is.Not.Null);
                Assert.That(tileset.Tiles[1].sprite, Is.Not.Null);
                Assert.That(tileset.Tiles[2].sprite, Is.Not.Null);
                Assert.That(tileset.Tiles[3].sprite, Is.Null);
                Assert.That(tileset.SpriteSheet.GetPixel(8, 24), Is.EqualTo(Color.red));
                Assert.That(tileset.SpriteSheet.GetPixel(24, 24), Is.EqualTo(Color.green));
            }
            finally { AssetDatabase.DeleteAsset(folder); }
        }

        // A single RGBA cel: red/green top tiles, blue bottom-left, transparent bottom-right.
        private static byte[] CreateSheet()
        {
            using var stream = new MemoryStream();
            using var writer = new BinaryWriter(stream);
            writer.Write(new byte[128]);
            var frameStart = stream.Position;
            writer.Write((uint)0); writer.Write((ushort)0xF1FA);
            writer.Write((ushort)2); writer.Write((ushort)100);
            writer.Write((ushort)0); writer.Write((uint)0);
            var layerStart = stream.Position;
            writer.Write((uint)0); writer.Write((ushort)0x2004);
            writer.Write((ushort)3); // Visible and editable.
            for (var i = 0; i < 5; i++) writer.Write((ushort)0);
            writer.Write((byte)255); writer.Write(new byte[3]);
            writer.Write((ushort)4); writer.Write(new byte[] { 84, 101, 115, 116 });
            var cellStart = stream.Position;
            writer.Write((uint)(6 + 20 + 32 * 32 * 4)); writer.Write((ushort)0x2005);
            writer.Write((ushort)0); writer.Write((short)0); writer.Write((short)0);
            writer.Write((byte)255); writer.Write((ushort)0); // Raw image.
            writer.Write((short)0); writer.Write(new byte[5]);
            writer.Write((ushort)32); writer.Write((ushort)32);
            for (var y = 0; y < 32; y++)
                for (var x = 0; x < 32; x++)
                    writer.Write(new byte[] { (byte)(y < 16 && x < 16 ? 255 : 0), (byte)(y < 16 && x >= 16 ? 255 : 0), (byte)(y >= 16 && x < 16 ? 255 : 0), (byte)(y < 16 || x < 16 ? 255 : 0) });
            var length = stream.Position;
            stream.Position = layerStart; writer.Write((uint)(cellStart - layerStart));
            stream.Position = frameStart; writer.Write((uint)(length - frameStart));
            stream.Position = 0;
            writer.Write((uint)length); writer.Write((ushort)0xA5E0); writer.Write((ushort)1);
            writer.Write((ushort)32); writer.Write((ushort)32); writer.Write((ushort)32);
            writer.Write((uint)1); writer.Write((ushort)100);
            stream.Position = 32; writer.Write((byte)1); writer.Write((byte)1);
            return stream.ToArray();
        }
    }
}
