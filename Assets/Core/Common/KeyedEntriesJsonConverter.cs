using System;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Core.Common
{
    /// <summary>
    /// Reads a JSON object keyed by name ({ "happy": "…" }) into an array of entries whose first serialized field gets
    /// the key and second the value, such as emotion → portrait.
    /// </summary>
    public sealed class KeyedEntriesJsonConverter : JsonConverter
    {
        public override bool CanConvert(Type objectType) => objectType.IsArray;

        public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
        {
            var element = objectType.GetElementType();
            var fields = element.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                .Where(field => field.IsPublic || field.IsDefined(typeof(SerializeField))).Take(2).ToArray();
            var entries = JObject.Load(reader).Properties().ToArray();
            var result = Array.CreateInstance(element, entries.Length);
            for (var i = 0; i < entries.Length; i++)
            {
                var entry = Activator.CreateInstance(element, true);
                fields[0].SetValue(entry, entries[i].Name);
                fields[1].SetValue(entry, entries[i].Value.ToObject(fields[1].FieldType, serializer));
                result.SetValue(entry, i);
            }
            return result;
        }

        public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer) =>
            throw new NotSupportedException("Definitions are only read.");
    }
}
