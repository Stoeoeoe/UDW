using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using UnityEditor.AssetImporters;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Tile.Editor.Vulcanus
{
    /// <summary>
    /// Fills definitions straight from Vulcanus JSON: each JSON property sets the serialized field of the same name.
    /// Kinds are read as camelCase enum names; anything else needing conversion says so with [JsonConverter] on its
    /// field. The schema checks the file first; the definition's own rules run after.
    /// </summary>
    internal static class VulcanusJson
    {
        private static readonly JsonSerializerSettings Settings = new()
        {
            ContractResolver = new SerializedFields(),
            Converters = { new StringEnumConverter(new CamelCaseNamingStrategy()) },
            DateParseHandling = DateParseHandling.None
        };

        /// <summary>Imports the file as the asset's main object, named by <paramref name="name"/>.</summary>
        public static T Import<T>(AssetImportContext ctx, Func<T, string> name) where T : ValidatedScriptableObject
        {
            var definition = Read<T>(VulcanusSchema.ReadChecked(ctx), ctx.assetPath);
            definition.name = name(definition);
            ctx.AddObjectToAsset("main", definition);
            ctx.SetMainObject(definition);
            return definition;
        }

        /// <summary>A new definition from JSON the schema has already accepted.</summary>
        public static T Read<T>(string json, string sourcePath) where T : ValidatedScriptableObject
        {
            var definition = ScriptableObject.CreateInstance<T>();
            try { return Populate(definition, json); }
            catch (Exception error) when (error is not FormatException)
            {
                Object.DestroyImmediate(definition);
                throw new FormatException($"{sourcePath}: {error.Message}", error);
            }
        }

        /// <summary>Fills a definition from JSON and checks its rules. Tests use it with short, lenient JSON.</summary>
        public static T Populate<T>(T definition, string json) where T : ValidatedScriptableObject
        {
            Fill(definition, json);
            definition.RequireValidConfiguration();
            return definition;
        }

        /// <summary>Fills fields from JSON without checking rules, for files that add to a definition (such as texts).</summary>
        public static void Fill(object target, string json) => JsonConvert.PopulateObject(json, target, Settings);

        /// <summary>Unity's serialized fields: public ones and [SerializeField] ones, including inherited private fields.</summary>
        private sealed class SerializedFields : DefaultContractResolver
        {
            protected override List<MemberInfo> GetSerializableMembers(Type type)
            {
                var fields = new List<MemberInfo>();
                for (var current = type; current != null && current != typeof(Object) && current != typeof(object); current = current.BaseType)
                    fields.AddRange(current.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                        .Where(field => (field.IsPublic || field.IsDefined(typeof(SerializeField))) && !field.IsNotSerialized));
                return fields;
            }

            protected override JsonProperty CreateProperty(MemberInfo member, MemberSerialization memberSerialization)
            {
                var property = base.CreateProperty(member, memberSerialization);
                property.Writable = true;
                return property;
            }

            protected override JsonObjectContract CreateObjectContract(Type objectType)
            {
                var contract = base.CreateObjectContract(objectType);
                // Plain configuration classes are built field by field, even when they have a private constructor.
                if (!objectType.IsSubclassOf(typeof(Object)) && objectType.GetConstructor(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public, null, Type.EmptyTypes, null) is { } constructor)
                    contract.DefaultCreator = () => constructor.Invoke(null);
                return contract;
            }
        }
    }
}
