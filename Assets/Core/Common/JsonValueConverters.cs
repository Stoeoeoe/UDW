using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Core.Common
{
    /// <summary>Reads an authored "#rrggbb" color. The schema guarantees the format.</summary>
    public sealed class HexColorJsonConverter : JsonConverter<Color>
    {
        public override Color ReadJson(JsonReader reader, Type objectType, Color existingValue, bool hasExistingValue, JsonSerializer serializer) =>
            ColorUtility.TryParseHtmlString((string)reader.Value, out var color) ? color : throw new FormatException($"'{reader.Value}' is not a color.");

        public override void WriteJson(JsonWriter writer, Color value, JsonSerializer serializer) =>
            writer.WriteValue("#" + ColorUtility.ToHtmlStringRGB(value));
    }

    /// <summary>Reads an authored [x, y] pair.</summary>
    public sealed class Vector2IntJsonConverter : JsonConverter<Vector2Int>
    {
        public override Vector2Int ReadJson(JsonReader reader, Type objectType, Vector2Int existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            var pair = JArray.Load(reader);
            return new Vector2Int((int)pair[0], (int)pair[1]);
        }

        public override void WriteJson(JsonWriter writer, Vector2Int value, JsonSerializer serializer) =>
            new JArray(value.x, value.y).WriteTo(writer);
    }

    /// <summary>Keeps any authored JSON value as its JSON text, for values whose type the data decides.</summary>
    public sealed class RawJsonJsonConverter : JsonConverter<string>
    {
        public override string ReadJson(JsonReader reader, Type objectType, string existingValue, bool hasExistingValue, JsonSerializer serializer) =>
            JToken.Load(reader).ToString(Formatting.None);

        public override void WriteJson(JsonWriter writer, string value, JsonSerializer serializer) => writer.WriteRawValue(value);
    }
}
