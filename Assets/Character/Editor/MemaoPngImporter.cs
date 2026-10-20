using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Character.Animations;
using UnityEditor;
using UnityEngine;

namespace Character.Editor
{
    /// <summary>Imports only source PNGs below Assets/Character/Memao.</summary>
    public sealed class MemaoPngImporter : AssetPostprocessor
    {
        private const string Root = "Assets/Character/Memao";
        private const int Width = 384;
        private const int Height = 1968;
        private const int Tile = 48;
        private const int Columns = Width / Tile;
        private const float Fps = 8f;

        // Sequential frame counts; each full four-direction animation is D, U, L, R.
        private readonly struct Spec
        {
            public readonly string Name;
            public readonly int FramesPerDirection;
            public readonly string[] Directions;
            public Spec(string name, int frames, params string[] directions)
            {
                Name = name;
                FramesPerDirection = frames;
                Directions = directions;
            }
        }

        private static readonly string[] Four = { "D", "U", "L", "R" };
        private static readonly Spec[] Layout =
        {
            new("Idle",4,"D","U","L","R"),
            new("Walk",6,"D","U","L","R"),
            new("Run",6,"D","U","L","R"),
            new("Pickup",4,"D","U","L","R"),
            new("Mine",4,"D","U","L","R"),
            new("Chop",4,"D","U","L","R"),
            new("Seed",3,"D","U","L","R"),
            new("Water",4,"D","U","L","R"),
            new("Reap",4,"D","U","L","R"),
            new("Slash",4,"D","U","L","R"),
            new("Hurt",2,"D","U","L","R"),
            new("Downed",2,"D","U","L","R"),
            new("Death",3,"D","U","L","R"),
            new("Eat",3,"D","U","L","R"),
            new("Drink",3,"D","U","L","R"),
            new("Wave",4,"D","U","L","R"),
            new("Laugh",3,"D","U","L","R"),
            new("Shrug",4,"D","U","L","R"),
            new("Think",4,"D","U","L","R"),
            new("Sit",4,"D","U","L","R"),
            new("Read",4,"D","U","L","R"),
            new("Paint",4,"L","R")
        };

        private static readonly HashSet<string> Pending = new(StringComparer.OrdinalIgnoreCase);
        private static bool scheduled;

        private static bool IsSource(string path) =>
            path.StartsWith(Root + "/", StringComparison.OrdinalIgnoreCase) &&
            path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) &&
            !path.Contains("/Generated/");

        private void OnPreprocessTexture()
        {
            if (!IsSource(assetPath)) return;
            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.filterMode = FilterMode.Point;
            importer.mipmapEnabled = false;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.spritePixelsPerUnit = 16;

            // Unity 6 retains spritesheet although the Sprite Editor data-provider API is preferred.
#pragma warning disable 0618
            var rects = new SpriteMetaData[Width / Tile * Height / Tile];
            for (var i = 0; i < rects.Length; ++i)
            {
                int x = (i % Columns) * Tile;
                int y = Height - (i / Columns + 1) * Tile;
                rects[i] = new SpriteMetaData
                {
                    name = FrameName(i),
                    rect = new Rect(x, y, Tile, Tile),
                    // This atlas's standing foot line is 7 pixels above the frame bottom.
                    // CharacterGraphics is the character's ground origin, not its center.
                    alignment = (int)SpriteAlignment.Custom,
                    pivot = new Vector2(.5f, 7f / Tile)
                };
            }
            importer.spritesheet = rects;
#pragma warning restore 0618
        }

        private static string FrameName(int index) => $"Frame_{index:D3}";

        private static void OnPostprocessAllAssets(string[] imported, string[] deleted,
            string[] moved, string[] movedFrom)
        {
            foreach (var path in imported.Concat(moved))
                if (IsSource(path)) Pending.Add(path);
            if (Pending.Count == 0 || scheduled) return;
            scheduled = true;
            EditorApplication.delayCall += Flush;
        }

        [MenuItem("Tools/Character/Rebuild Memao Animations")]
        private static void RebuildAll()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { Root }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (IsSource(path)) Pending.Add(path);
            }
            Flush();
        }

        private static void Flush()
        {
            scheduled = false;
            var paths = Pending.ToArray();
            Pending.Clear();
            foreach (var path in paths)
                try { Generate(path); }
                catch (Exception exception) { Debug.LogException(exception); }
            AssetDatabase.SaveAssets();
        }

        private static void Generate(string path)
        {
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (!texture || texture.width != Width || texture.height != Height)
            {
                Debug.LogError($"Memao atlas must be {Width}x{Height}: {path}");
                return;
            }

            var sprites = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>()
                .ToDictionary(sprite => sprite.name, StringComparer.Ordinal);
            if (sprites.Count != 328)
            {
                Debug.LogError($"Expected 328 sliced sprites, found {sprites.Count}: {path}");
                return;
            }

            string name = Path.GetFileNameWithoutExtension(path);
            string folder = Path.GetDirectoryName(path)?.Replace('\\', '/') + "/Generated";
            if (!AssetDatabase.IsValidFolder(folder))
                AssetDatabase.CreateFolder(Path.GetDirectoryName(path)?.Replace('\\', '/'), "Generated");
            string output = folder + "/" + name;
            if (!AssetDatabase.IsValidFolder(output)) AssetDatabase.CreateFolder(folder, name);

            var entries = new List<MemaoAnimationLibrary.Entry>();
            int index = 0;
            foreach (var spec in Layout)
            {
                foreach (var direction in spec.Directions)
                {
                    string clipName = spec.Name + "_" + direction;
                    string clipPath = output + "/" + clipName + ".anim";
                    var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
                    if (!clip)
                    {
                        clip = new AnimationClip { name = clipName, frameRate = Fps };
                        AssetDatabase.CreateAsset(clip, clipPath);
                    }
                    clip.frameRate = Fps;
                    var keys = new ObjectReferenceKeyframe[spec.FramesPerDirection];
                    for (int frame = 0; frame < keys.Length; ++frame)
                    {
                        var spriteName = FrameName(index++);
                        if (!sprites.TryGetValue(spriteName, out var sprite))
                            throw new InvalidOperationException($"Missing sprite {spriteName} from {path}");
                        keys[frame] = new ObjectReferenceKeyframe { time = frame / Fps, value = sprite };
                    }
                    var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
                    AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
                    bool looping = spec.Name == "Idle" || spec.Name == "Walk" || spec.Name == "Run";
                    var settings = AnimationUtility.GetAnimationClipSettings(clip);
                    settings.loopTime = looping;
                    AnimationUtility.SetAnimationClipSettings(clip, settings);
                    EditorUtility.SetDirty(clip);
                    entries.Add(new MemaoAnimationLibrary.Entry { name = clipName, clip = clip });
                }
            }
            if (index != 324) throw new InvalidOperationException($"Layout consumes {index} frames rather than 324");

            string libraryPath = output + "/" + name + "_Animations.asset";
            var library = AssetDatabase.LoadAssetAtPath<MemaoAnimationLibrary>(libraryPath);
            if (!library)
            {
                library = ScriptableObject.CreateInstance<MemaoAnimationLibrary>();
                AssetDatabase.CreateAsset(library, libraryPath);
            }
            library.SetClips(entries);
            EditorUtility.SetDirty(library);
            Debug.Log($"Memao: generated {entries.Count} clips from {path}. Library: {libraryPath}");
        }
    }
}
