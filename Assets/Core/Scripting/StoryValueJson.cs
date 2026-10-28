using System;
using System.Collections.Generic;
using Core.Game;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Core.Scripting
{
    /// <summary>Checks visual-action JSON before it is compiled or bound to gameplay.</summary>
    public static class StoryValueJson
    {
        public static StoryValue Parse(string json) => new(Read(JsonConvert.DeserializeObject<JToken>(json,
            new JsonSerializerSettings { DateParseHandling = DateParseHandling.None }) ?? throw new FormatException("A story value is required.")));

        private static object Read(JToken token)
        {
            switch (token.Type)
            {
                case JTokenType.Boolean: return token.Value<bool>();
                case JTokenType.String: return token.Value<string>();
                case JTokenType.Integer:
                case JTokenType.Float:
                    var number = token.Value<double>();
                    if (!double.IsFinite(number) || (number == Math.Truncate(number) && Math.Abs(number) > 9007199254740991d))
                        throw new FormatException("Story action numbers must be finite; integers must fit Lua's exact integer range.");
                    return number;
                case JTokenType.Object:
                    var result = new Dictionary<string, object>(StringComparer.Ordinal);
                    foreach (var property in ((JObject)token).Properties())
                        result.Add(property.Name, Read(property.Value));
                    return result;
                default: throw new FormatException("Story actions accept booleans, strings, finite numbers and string-keyed objects; null and arrays are not values.");
            }
        }
    }
}
