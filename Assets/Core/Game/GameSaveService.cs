using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace Core.Game
{
    /// <summary>Reads and writes versioned game-state snapshots in Unity's persistent data folder.</summary>
    public static class GameSaveService
    {
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

        public static void Save(string slot, GameSaveData data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            data.Validate();

            var path = GetSavePath(slot);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var temporaryPath = path + ".tmp";
            File.WriteAllText(temporaryPath, JsonUtility.ToJson(data, true), Utf8);

            if (File.Exists(path))
                File.Replace(temporaryPath, path, path + ".bak");
            else
                File.Move(temporaryPath, path);
        }

        public static bool TryLoad(string slot, out GameSaveData data)
        {
            var path = GetSavePath(slot);
            if (!File.Exists(path))
            {
                data = null;
                return false;
            }

            data = JsonUtility.FromJson<GameSaveData>(File.ReadAllText(path, Utf8));
            if (data == null) throw new FormatException("The save file is empty or invalid.");
            data.Validate();
            return true;
        }

        public static string GetSavePath(string slot)
        {
            if (string.IsNullOrEmpty(slot) || slot.Length > 64)
                throw new ArgumentException("A save slot must be 1-64 letters, digits, '-' or '_' characters.", nameof(slot));

            foreach (var c in slot)
                if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') &&
                    !(c >= '0' && c <= '9') && c != '-' && c != '_')
                    throw new ArgumentException("A save slot must be 1-64 letters, digits, '-' or '_' characters.", nameof(slot));

            return Path.Combine(Application.persistentDataPath, "Saves", "slot-" + slot + ".json");
        }
    }
}
