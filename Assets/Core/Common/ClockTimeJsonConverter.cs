using System;
using System.Globalization;
using Newtonsoft.Json;

namespace Core.Common
{
    /// <summary>Reads an authored "HH:MM" time of day as minutes after midnight. The schema guarantees the format.</summary>
    public sealed class ClockTimeJsonConverter : JsonConverter<int>
    {
        public override int ReadJson(JsonReader reader, Type objectType, int existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            var time = (string)reader.Value;
            return int.Parse(time[..2], CultureInfo.InvariantCulture) * 60 + int.Parse(time[3..], CultureInfo.InvariantCulture);
        }

        public override void WriteJson(JsonWriter writer, int value, JsonSerializer serializer) =>
            writer.WriteValue($"{value / 60:00}:{value % 60:00}");
    }
}
