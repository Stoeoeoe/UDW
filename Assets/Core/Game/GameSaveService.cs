using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Character;
using Core.Inventory;
using Sirenix.Serialization;
using UnityEngine;

namespace Core.Game
{
    /// <summary>Reads and writes the versioned game-state root and its slot headers in Unity's persistent data folder.</summary>
    public sealed class GameSaveService
    {
        private const string SlotPrefix = "slot-";
        private readonly CharacterCatalog _characters;
        private readonly ItemCatalog _items;
        private Func<DateTime> _utcNow = () => DateTime.UtcNow;
        public GameSaveService(CharacterCatalog characters, ItemCatalog items)
        { _characters = characters; _items = items; }

        public void Save(string slot, GameSaveData data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            data.Validate(_characters, _items);

            // Save data must not depend on scene or asset instance references.
            var bytes = SerializationUtility.SerializeValue(data, DataFormat.JSON, out var unityObjects);
            if (unityObjects.Count != 0)
                throw new InvalidOperationException("Save data contains Unity object references; store stable IDs instead.");

            WriteAtomically(GetSavePath(slot), bytes, keepBackup: true);
            WriteHeader(slot, SaveSlotHeader.From(data, _utcNow()));
        }

        public bool TryLoad(string slot, out GameSaveData data)
        {
            var path = GetSavePath(slot);
            if (!File.Exists(path))
            {
                data = null;
                return false;
            }

            data = SerializationUtility.DeserializeValue<GameSaveData>(File.ReadAllBytes(path), DataFormat.JSON);
            if (data == null) throw new FormatException("The save file is empty or invalid.");
            data.Validate(_characters, _items);
            return true;
        }

        /// <summary>Every slot on disk. A slot that cannot be read is listed with its error instead of failing the listing.</summary>
        public IReadOnlyList<SaveSlotInfo> ListSlots()
        {
            var folder = GetSaveFolder();
            if (!Directory.Exists(folder)) return Array.Empty<SaveSlotInfo>();

            var slots = new List<SaveSlotInfo>();
            foreach (var file in Directory.EnumerateFiles(folder, SlotPrefix + "*.json"))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                var slot = name.Substring(SlotPrefix.Length);
                // The summary files (slot-1.meta.json) and other stray files are not slots.
                if (IsValidSlot(slot)) slots.Add(ReadSlot(slot));
            }
            return slots;
        }

        /// <summary>The slot Continue resumes, or null when no slot can be read.</summary>
        public string GetLastPlayedSlot() => SaveSlotInfo.LastPlayed(ListSlots())?.Slot;

        /// <summary>The first unused numbered slot, for a new game.</summary>
        public string NextSlotId()
        {
            for (var number = 1; ; number++)
                if (!File.Exists(GetSavePath(number.ToString()))) return number.ToString();
        }

        public void Delete(string slot)
        {
            var path = GetSavePath(slot);
            var headerPath = GetHeaderPath(slot);
            foreach (var file in new[] { path, path + ".bak", path + ".tmp", headerPath, headerPath + ".tmp" })
                File.Delete(file);
        }

        // The header is derived data: a missing, corrupt or older-than-the-save header is rebuilt from the save itself.
        private SaveSlotInfo ReadSlot(string slot)
        {
            if (TryReadHeader(slot, out var header)) return new SaveSlotInfo(slot, header, null);
            try
            {
                TryLoad(slot, out var data);
                header = SaveSlotHeader.From(data, File.GetLastWriteTimeUtc(GetSavePath(slot)));
                WriteHeader(slot, header);
                return new SaveSlotInfo(slot, header, null);
            }
            catch (Exception exception)
            {
                return new SaveSlotInfo(slot, null, exception.Message);
            }
        }

        private static bool TryReadHeader(string slot, out SaveSlotHeader header)
        {
            header = null;
            var path = GetSavePath(slot);
            var headerPath = GetHeaderPath(slot);
            if (!File.Exists(headerPath) || File.GetLastWriteTimeUtc(headerPath) < File.GetLastWriteTimeUtc(path))
                return false;
            try { header = JsonUtility.FromJson<SaveSlotHeader>(File.ReadAllText(headerPath)); }
            catch (ArgumentException) { return false; }
            return header != null && header.IsValid();
        }

        private static void WriteHeader(string slot, SaveSlotHeader header) =>
            WriteAtomically(GetHeaderPath(slot), Encoding.UTF8.GetBytes(JsonUtility.ToJson(header)), keepBackup: false);

        private static void WriteAtomically(string path, byte[] bytes, bool keepBackup)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var temporaryPath = path + ".tmp";
            File.WriteAllBytes(temporaryPath, bytes);

            if (File.Exists(path))
                File.Replace(temporaryPath, path, keepBackup ? path + ".bak" : null);
            else
                File.Move(temporaryPath, path);
        }

        public static string GetSavePath(string slot)
        {
            RequireValidSlot(slot);
            return Path.Combine(GetSaveFolder(), SlotPrefix + slot + ".json");
        }

        private static string GetHeaderPath(string slot)
        {
            RequireValidSlot(slot);
            return Path.Combine(GetSaveFolder(), SlotPrefix + slot + ".meta.json");
        }

        private static string GetSaveFolder() => Path.Combine(Application.persistentDataPath, "Saves");

        private static void RequireValidSlot(string slot)
        {
            if (!IsValidSlot(slot))
                throw new ArgumentException("A save slot must be 1-64 letters, digits, '-' or '_' characters.", nameof(slot));
        }

        private static bool IsValidSlot(string slot)
        {
            if (string.IsNullOrEmpty(slot) || slot.Length > 64) return false;
            foreach (var c in slot)
                if (!(c >= 'a' && c <= 'z') && !(c >= 'A' && c <= 'Z') &&
                    !(c >= '0' && c <= '9') && c != '-' && c != '_')
                    return false;
            return true;
        }
    }
}
