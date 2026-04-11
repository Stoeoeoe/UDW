using System;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Core.Location;
using Core.Tile.Vulcan;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Core.Tile.Editor.Vulcan
{
    /// <summary>
    /// Applies Vulcan entity and location-link data to prefab instances at import time.
    /// No runtime reflection — everything is resolved and serialized during map import.
    /// </summary>
    internal static class VulcanEntityInitializer
    {
        private const BindingFlags MemberFlags =
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        // ── Entity prefabs ────────────────────────────────────────────────────────

        /// <summary>
        /// Tries every known init method on each MonoBehaviour of the instance,
        /// then applies JSON properties by name matching.
        /// </summary>
        public static void InitializeEntity(GameObject instance, VulcanEntityInstanceData data)
        {
            var behaviours = instance.GetComponentsInChildren<MonoBehaviour>(includeInactive: true);
            foreach (var behaviour in behaviours)
            {
                if (behaviour == null) continue;
                TryInvokeInitMethod(behaviour, "ApplyVulcanEntityData", data);
                TryInvokeInitMethod(behaviour, "InitializeFromVulcan", data);
                TryInvokeInitMethod(behaviour, "ConfigureFromVulcan", data);
                ApplyJsonProperties(behaviour, data.propertiesJson);
            }

            EditorUtility.SetDirty(instance);
        }

        // ── Location link prefabs ─────────────────────────────────────────────────

        public static void InitializeLocationLink(GameObject instance, VulcanLocationLinkData data, VulcanWorldCatalog catalog)
        {
            var link = instance.GetComponent<ILocationLink>();
            if (link != null)
                link.ApplyVulcanData(data, catalog);

            EditorUtility.SetDirty(instance);
        }

        // ── Init method dispatch ──────────────────────────────────────────────────

        private static void TryInvokeInitMethod(object target, string methodName, VulcanEntityInstanceData data)
        {
            var type = target.GetType();

            var byData = type.GetMethod(methodName, MemberFlags, null,
                new[] { typeof(VulcanEntityInstanceData) }, null);
            if (byData != null)
            {
                byData.Invoke(target, new object[] { data });
                return;
            }

            var byJson = type.GetMethod(methodName, MemberFlags, null,
                new[] { typeof(string) }, null);
            byJson?.Invoke(target, new object[] { data.propertiesJson });
        }

        // ── JSON property application ─────────────────────────────────────────────

        private static void ApplyJsonProperties(object target, string propertiesJson)
        {
            if (string.IsNullOrWhiteSpace(propertiesJson)) return;

            JObject root;
            try { root = JObject.Parse(propertiesJson); }
            catch { return; }

            var type = target.GetType();

            foreach (var field in type.GetFields(MemberFlags))
            {
                if (field.IsStatic || field.IsInitOnly || field.IsLiteral) continue;
                if (TryFindToken(root, field.Name, out var token) &&
                    TryConvert(token, field.FieldType, out var value))
                    field.SetValue(target, value);
            }

            foreach (var prop in type.GetProperties(MemberFlags))
            {
                var setter = prop.GetSetMethod(nonPublic: true);
                if (setter == null || setter.IsStatic || setter.GetParameters().Length != 1) continue;
                if (TryFindToken(root, prop.Name, out var token) &&
                    TryConvert(token, prop.PropertyType, out var value))
                    prop.SetValue(target, value);
            }
        }

        private static bool TryFindToken(JObject root, string memberName, out JToken token)
        {
            var key = Normalize(memberName);
            foreach (var p in root.Properties())
            {
                if (Normalize(p.Name) == key) { token = p.Value; return true; }
            }
            token = null;
            return false;
        }

        private static string Normalize(string s) =>
            new string(s.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

        // ── Type converters ───────────────────────────────────────────────────────

        private static bool TryConvert(JToken t, Type type, out object value)
        {
            value = null;
            var inner = Nullable.GetUnderlyingType(type);
            if (inner != null)
            {
                if (t.Type == JTokenType.Null) return true;
                return TryConvert(t, inner, out value);
            }

            if (type == typeof(string))  { value = t.Type == JTokenType.String ? t.Value<string>() : t.ToString(); return true; }
            if (type == typeof(bool))    return TryBool(t, out value);
            if (type == typeof(int))     return TryInt(t, out value);
            if (type == typeof(float))   return TryFloat(t, out value);
            if (type == typeof(double))  return TryDouble(t, out value);
            if (type == typeof(long))    return TryLong(t, out value);
            if (type == typeof(Vector2))    return TryVec2(t, out value);
            if (type == typeof(Vector3))    return TryVec3(t, out value);
            if (type == typeof(Vector2Int)) return TryVec2Int(t, out value);
            if (type == typeof(Vector3Int)) return TryVec3Int(t, out value);
            if (type == typeof(Color))      return TryColor(t, out value);
            if (type.IsEnum)             return TryEnum(t, type, out value);
            return false;
        }

        private static bool TryBool(JToken t, out object v)
        {
            v = null;
            switch (t.Type)
            {
                case JTokenType.Boolean: v = t.Value<bool>(); return true;
                case JTokenType.Integer:
                case JTokenType.Float:   v = Math.Abs(t.Value<double>()) > float.Epsilon; return true;
                case JTokenType.String when bool.TryParse(t.Value<string>(), out var b): v = b; return true;
                default: return false;
            }
        }

        private static bool TryInt(JToken t, out object v)
        {
            v = null;
            switch (t.Type)
            {
                case JTokenType.Integer: v = t.Value<int>(); return true;
                case JTokenType.Float:   v = Mathf.RoundToInt(t.Value<float>()); return true;
                case JTokenType.String when int.TryParse(t.Value<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var i): v = i; return true;
                default: return false;
            }
        }

        private static bool TryFloat(JToken t, out object v)
        {
            v = null;
            switch (t.Type)
            {
                case JTokenType.Integer:
                case JTokenType.Float: v = t.Value<float>(); return true;
                case JTokenType.String when float.TryParse(t.Value<string>(), NumberStyles.Float, CultureInfo.InvariantCulture, out var f): v = f; return true;
                default: return false;
            }
        }

        private static bool TryDouble(JToken t, out object v)
        {
            v = null;
            switch (t.Type)
            {
                case JTokenType.Integer:
                case JTokenType.Float: v = t.Value<double>(); return true;
                case JTokenType.String when double.TryParse(t.Value<string>(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d): v = d; return true;
                default: return false;
            }
        }

        private static bool TryLong(JToken t, out object v)
        {
            v = null;
            switch (t.Type)
            {
                case JTokenType.Integer: v = t.Value<long>(); return true;
                case JTokenType.Float:   v = (long)Math.Round(t.Value<double>()); return true;
                case JTokenType.String when long.TryParse(t.Value<string>(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l): v = l; return true;
                default: return false;
            }
        }

        private static bool TryVec2(JToken t, out object v)
        {
            v = null;
            if (t is JArray a && a.Count >= 2 && F(a[0], out var x) && F(a[1], out var y))
                { v = new Vector2(x, y); return true; }
            if (t is JObject o && F(o["x"], out var ox) && F(o["y"], out var oy))
                { v = new Vector2(ox, oy); return true; }
            return false;
        }

        private static bool TryVec3(JToken t, out object v)
        {
            v = null;
            if (t is JArray a && a.Count >= 3 && F(a[0], out var x) && F(a[1], out var y) && F(a[2], out var z))
                { v = new Vector3(x, y, z); return true; }
            if (t is JObject o && F(o["x"], out var ox) && F(o["y"], out var oy) && F(o["z"], out var oz))
                { v = new Vector3(ox, oy, oz); return true; }
            return false;
        }

        private static bool TryVec2Int(JToken t, out object v)
        {
            v = null;
            if (!TryVec2(t, out var raw)) return false;
            var u = (Vector2)raw;
            v = new Vector2Int(Mathf.RoundToInt(u.x), Mathf.RoundToInt(u.y));
            return true;
        }

        private static bool TryVec3Int(JToken t, out object v)
        {
            v = null;
            if (!TryVec3(t, out var raw)) return false;
            var u = (Vector3)raw;
            v = new Vector3Int(Mathf.RoundToInt(u.x), Mathf.RoundToInt(u.y), Mathf.RoundToInt(u.z));
            return true;
        }

        private static bool TryColor(JToken t, out object v)
        {
            v = null;
            if (t.Type == JTokenType.String)
            {
                var s = t.Value<string>();
                if (ColorUtility.TryParseHtmlString(s, out var hex)) { v = hex; return true; }
                var parts = s.Split(',');
                if ((parts.Length == 3 || parts.Length == 4)
                    && float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var r)
                    && float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var g)
                    && float.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var b))
                {
                    var a = 1f;
                    if (parts.Length == 4 && !float.TryParse(parts[3], NumberStyles.Float, CultureInfo.InvariantCulture, out a)) return false;
                    v = new Color(r, g, b, a); return true;
                }
                return false;
            }
            if (t is JArray arr && arr.Count >= 3 && F(arr[0], out var ar) && F(arr[1], out var ag) && F(arr[2], out var ab))
            {
                var aa = 1f; if (arr.Count > 3) F(arr[3], out aa);
                v = new Color(ar, ag, ab, aa); return true;
            }
            if (t is JObject obj && F(obj["r"], out var or) && F(obj["g"], out var og) && F(obj["b"], out var ob))
            {
                var oa = 1f; F(obj["a"], out oa);
                v = new Color(or, og, ob, oa); return true;
            }
            return false;
        }

        private static bool TryEnum(JToken t, Type enumType, out object v)
        {
            v = null;
            if (t.Type == JTokenType.String && Enum.TryParse(enumType, t.Value<string>(), ignoreCase: true, out var ev))
                { v = ev; return true; }
            if (TryInt(t, out var iv)) { v = Enum.ToObject(enumType, iv); return true; }
            return false;
        }

        // Shorthand float reader used by vector/color converters
        private static bool F(JToken t, out float r)
        {
            r = 0f;
            if (t == null || t.Type == JTokenType.Null) return false;
            switch (t.Type)
            {
                case JTokenType.Integer:
                case JTokenType.Float: r = t.Value<float>(); return true;
                case JTokenType.String: return float.TryParse(t.Value<string>(), NumberStyles.Float, CultureInfo.InvariantCulture, out r);
                default: return false;
            }
        }
    }
}
