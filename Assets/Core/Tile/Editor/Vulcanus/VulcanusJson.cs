using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization;
using Core.Common;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using UnityEditor;
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
            Converters = { new StringEnumConverter(new CamelCaseNamingStrategy()), new AssetReferences() },
            DateParseHandling = DateParseHandling.None
        };

        /// <summary>
        /// Imports the file as the asset's main object, named by <paramref name="name"/>. The <paramref name="identifier"/>
        /// keeps the object's file ID stable, so prefabs and catalogs that reference it keep working.
        /// </summary>
        public static T Import<T>(AssetImportContext ctx, string identifier, Func<T, string> name) where T : ScriptableObject =>
            (T)Import(ctx, typeof(T), identifier, VulcanusSchema.ReadChecked(ctx), definition => name((T)definition));

        /// <summary>Imports already schema-checked JSON as a definition of <paramref name="type"/>, for content whose type the file chooses.</summary>
        public static ScriptableObject Import(AssetImportContext ctx, Type type, string identifier, string json, Func<ScriptableObject, string> name)
        {
            var definition = ScriptableObject.CreateInstance(type);
            try { Populate(definition, json, ctx); }
            catch (Exception error)
            {
                Object.DestroyImmediate(definition);
                throw error is FormatException ? error : new FormatException($"{ctx.assetPath}: {error.Message}", error);
            }
            definition.name = name(definition);
            ctx.AddObjectToAsset(identifier, definition);
            ctx.SetMainObject(definition);
            return definition;
        }

        /// <summary>
        /// Fills a definition from JSON and checks its rules. Tests use it with short, lenient JSON; asset paths need
        /// the import <paramref name="ctx"/>.
        /// </summary>
        public static T Populate<T>(T definition, string json, AssetImportContext ctx = null) where T : ScriptableObject
        {
            Fill(definition, json, ctx);
            if (definition is ValidatedScriptableObject validated) validated.RequireValidConfiguration();
            return definition;
        }

        /// <summary>Fills fields from JSON without checking rules, for files that add to a definition (such as texts).</summary>
        public static void Fill(object target, string json, AssetImportContext ctx = null)
        {
            var serializer = JsonSerializer.Create(Settings);
            serializer.Context = new StreamingContext(StreamingContextStates.Other, ctx);
            using var reader = new JsonTextReader(new StringReader(json));
            serializer.Populate(reader, target);
        }

        /// <summary>
        /// Reads art and audio fields from paths relative to the file or project, recording each as an import dependency.
        /// </summary>
        private sealed class AssetReferences : JsonConverter
        {
            public override bool CanConvert(Type objectType) =>
                typeof(Object).IsAssignableFrom(objectType) && !typeof(ScriptableObject).IsAssignableFrom(objectType);

            public override object ReadJson(JsonReader reader, Type objectType, object existingValue, JsonSerializer serializer)
            {
                var path = (string)reader.Value;
                if (string.IsNullOrEmpty(path)) return null;
                var ctx = serializer.Context.Context as AssetImportContext
                    ?? throw new InvalidOperationException($"Reading the asset '{path}' needs an import.");
                var assetPath = VulcanusImportHelpers.ResolveAssetReferencePath(ctx.assetPath, path,
                        VulcanusImportHelpers.FindProjectAssetPath(ctx.assetPath))
                    ?? throw new FormatException($"{ctx.assetPath}: '{path}' does not exist.");
                VulcanusImportHelpers.AddDependency(ctx, assetPath);
                return AssetDatabase.LoadAssetAtPath(assetPath, objectType)
                    ?? throw new FormatException($"{ctx.assetPath}: '{path}' is not a {objectType.Name}.");
            }

            public override void WriteJson(JsonWriter writer, object value, JsonSerializer serializer) =>
                throw new NotSupportedException("Definitions are only read.");
        }

        /// <summary>Unity's serialized fields: public, [SerializeField] and [SerializeReference] ones, including inherited private fields.</summary>
        private sealed class SerializedFields : DefaultContractResolver
        {
            private const string BackingFieldAffix = ">k__BackingField";

            protected override List<MemberInfo> GetSerializableMembers(Type type)
            {
                var fields = new List<MemberInfo>();
                for (var current = type; current != null && current != typeof(Object) && current != typeof(object); current = current.BaseType)
                    fields.AddRange(current.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                        .Where(field => (field.IsPublic || field.IsDefined(typeof(SerializeField)) || field.IsDefined(typeof(SerializeReference))) &&
                                        !field.IsNotSerialized));
                return fields;
            }

            protected override JsonProperty CreateProperty(MemberInfo member, MemberSerialization memberSerialization)
            {
                var property = base.CreateProperty(member, memberSerialization);
                property.Writable = true;
                // An auto-property's backing field is read under the property's name in camelCase: Id -> id.
                if (member.Name.Length > BackingFieldAffix.Length + 1 && member.Name[0] == '<' && member.Name.EndsWith(BackingFieldAffix, StringComparison.Ordinal))
                {
                    var name = member.Name.Substring(1, member.Name.Length - BackingFieldAffix.Length - 1);
                    property.PropertyName = char.ToLowerInvariant(name[0]) + name.Substring(1);
                }
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
