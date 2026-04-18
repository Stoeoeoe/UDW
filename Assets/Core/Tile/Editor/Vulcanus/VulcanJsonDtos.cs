using System.Collections.Generic;
using Newtonsoft.Json;

namespace Core.Tile.Editor.Vulcanus
{
    // ── Project ───────────────────────────────────────────────────────────────

    internal class ProjectDto
    {
        [JsonProperty("version")] public string Version { get; set; } = "1.0";
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("tileSize")] public int TileSize { get; set; } = 16;
        [JsonProperty("defaultMapWidth")] public int DefaultMapWidth { get; set; } = 32;
        [JsonProperty("defaultMapHeight")] public int DefaultMapHeight { get; set; } = 32;

        [JsonProperty("terrainTypes")] public List<TerrainTypeDto> TerrainTypes { get; set; } = new();
        [JsonProperty("layerDefinitions")] public List<LayerDefinitionDto> LayerDefinitions { get; set; } = new();
        [JsonProperty("entityTypes")] public List<EntityTypeDto> EntityTypes { get; set; } = new();
        [JsonProperty("tileMetadataDefinitions")] public List<PropertyDefinitionDto> TileMetadataDefinitions { get; set; } = new();
        [JsonProperty("itemClasses")] public List<ItemClassDto> ItemClasses { get; set; } = new();
    }

    internal class ItemClassDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        // Fully-qualified CLR type name for the ItemDefinition-derived class.
        [JsonProperty("className")] public string ClassName { get; set; }
        // Optional property schema (kept as extension data) describing class-specific fields.
        [JsonExtensionData] public Dictionary<string, Newtonsoft.Json.Linq.JToken> Extra { get; set; } = new();
    }

    internal class ItemDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("category")] public string Category { get; set; }
        [JsonProperty("icon")] public string Icon { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("maxStackSize")] public int MaxStackSize { get; set; } = 99;
        [JsonProperty("pickupSound")] public string PickupSound { get; set; }
        [JsonProperty("classId")] public string ClassId { get; set; }
        // Arbitrary typed properties for the class; persisted into the ItemDefinition instance when possible.
        [JsonProperty("classProperties")] public Dictionary<string, Newtonsoft.Json.Linq.JToken> ClassProperties { get; set; } = new();
    }

    internal class TerrainTypeDto
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("displayName")] public string DisplayName { get; set; }
        [JsonProperty("color")] public string Color { get; set; }
    }

    internal class LayerDefinitionDto
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("name")] public string Name { get; set; } = "";
        [JsonProperty("type")] public string Type { get; set; } = "";
        [JsonProperty("color")] public string Color { get; set; }
        [JsonProperty("zIndex")] public int ZIndex { get; set; }
    }

    internal class EntityTypeDto
    {
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("displayName")] public string DisplayName { get; set; } = "";
        [JsonProperty("category")] public string Category { get; set; } = "";
        [JsonProperty("group")] public string Group { get; set; } = "";
    }

    // ── Tileset ───────────────────────────────────────────────────────────────

    internal class TilesetDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("spriteSheet")] public string SpriteSheet { get; set; }
        [JsonProperty("columns")] public int Columns { get; set; } = 1;
        [JsonProperty("tileCount")] public int TileCount { get; set; }

        // Keyed by tile-index string ("16", "17", …); sparse — missing entries are default tiles.
        [JsonProperty("tiles")] public Dictionary<string, TileMetaDto> Tiles { get; set; } = new();
    }

    internal class TileMetaDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("terrain")] public string Terrain { get; set; }
        [JsonProperty("terrainCorners")] public List<string> TerrainCorners { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; }
        [JsonProperty("collision")] public CollisionDto Collision { get; set; }
        [JsonProperty("properties")] public List<PropertyInstanceDto> Properties { get; set; } = new();
    }

    internal class CollisionDto
    {
        [JsonProperty("type")] public string Type { get; set; } = "";
    }

    internal class PropertyInstanceDto
    {
        [JsonProperty("key")] public string Key { get; set; }
        // Kept as raw token so importer can decide how to persist it.
        [JsonProperty("value")] public Newtonsoft.Json.Linq.JToken Value { get; set; }
    }

    internal class PropertyDefinitionDto
    {
        [JsonProperty("key")] public string Key { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("type")] public string Type { get; set; }
        [JsonProperty("defaultValue")] public Newtonsoft.Json.Linq.JToken DefaultValue { get; set; }
        [JsonProperty("required")] public bool Required { get; set; }
    }

    // ── Map ───────────────────────────────────────────────────────────────────

    internal class MapDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("width")] public int Width { get; set; } = 1;
        [JsonProperty("height")] public int Height { get; set; } = 1;
        [JsonProperty("tilesetRefs")] public List<string> TilesetRefs { get; set; } = new();
        [JsonProperty("layers")] public List<LayerDto> Layers { get; set; } = new();
        [JsonProperty("entities")] public List<EntityInstanceDto> Entities { get; set; } = new();
        [JsonProperty("locationLinks")] public List<LocationLinkDto> LocationLinks { get; set; } = new();
        [JsonProperty("metadata")] public MapMetadataDto Metadata { get; set; }
        [JsonProperty("spatialPrimitives")] public SpatialPrimitivesDto SpatialPrimitives { get; set; }
    }

    internal class MapMetadataDto
    {
        // Known built-in fields
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("music")] public string Music { get; set; }
        [JsonProperty("ambience")] public string Ambience { get; set; }

        // Catch-all for project-defined locationMetadataDefinitions keys
        [JsonExtensionData] public Dictionary<string, Newtonsoft.Json.Linq.JToken> Extra { get; set; } = new();
    }

    internal class SpatialPrimitivesDto
    {
        [JsonProperty("triggers")] public List<MapTriggerDto> Triggers { get; set; } = new();
        [JsonProperty("anchors")] public List<AnchorDto> Anchors { get; set; } = new();
    }

    internal class MapTriggerDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("type")] public string Type { get; set; } = "";
        [JsonProperty("shape")] public string Shape { get; set; } = "rectangle";
        [JsonProperty("position")] public List<float> Position { get; set; }
        [JsonProperty("size")] public List<float> Size { get; set; }
        [JsonProperty("points")] public List<List<float>> Points { get; set; } = new();
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
    }

    internal class AnchorDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("position")] public List<float> Position { get; set; }
        [JsonProperty("facing")] public List<float> Facing { get; set; }
        [JsonProperty("rotation")] public float Rotation { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
    }

    internal class LayerDto
    {
        [JsonProperty("name")] public string Name { get; set; } = "Layer";
        [JsonProperty("kind")] public string Kind { get; set; } = "visual";
        [JsonProperty("zOrder")] public int ZOrder { get; set; }
        [JsonProperty("opacity")] public float Opacity { get; set; } = 1f;
        [JsonProperty("visible")] public bool Visible { get; set; } = true;

        // Tile layers: either a 2-D array (dense) or a sparse object.
        // We keep this as raw Newtonsoft token to handle the union type.
        [JsonProperty("data")] public Newtonsoft.Json.Linq.JToken Data { get; set; }

        [JsonProperty("terrainData")] public Newtonsoft.Json.Linq.JArray TerrainData { get; set; }
        [JsonProperty("terrainPalette")] public List<string> TerrainPalette { get; set; }

        [JsonProperty("entities")] public List<EntityInstanceDto> Entities { get; set; } = new();
    }

    internal class EntityInstanceDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("typeId")] public string TypeId { get; set; } = "";
        [JsonProperty("layerId")] public string LayerId { get; set; } = "";
        [JsonProperty("label")] public string Label { get; set; } = "";
        [JsonProperty("position")] public List<float> Position { get; set; }
        [JsonProperty("rotation")] public float Rotation { get; set; }

        // Kept as raw token — reflected into MonoBehaviour fields by VulcanusEntityInitializer.
        [JsonProperty("properties")] public Newtonsoft.Json.Linq.JToken Properties { get; set; }
    }

    internal class LocationLinkDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("label")] public string Label { get; set; } = "";
        [JsonProperty("triggerId")] public string TriggerId { get; set; }
        [JsonProperty("targetMapId")] public string TargetMapId { get; set; } = "";
        [JsonProperty("targetAnchorId")] public string TargetAnchorId { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();

        // Legacy placement fields kept for backward compatibility with older map files.
        [JsonProperty("sourcePosition")] public List<float> SourcePosition { get; set; }
        [JsonProperty("sourceAnchorId")] public string SourceAnchorId { get; set; }
        [JsonProperty("triggerSize")] public List<float> TriggerSize { get; set; }
        [JsonProperty("targetPosition")] public List<float> TargetPosition { get; set; }
        [JsonProperty("targetFacing")] public List<float> TargetFacing { get; set; }
        [JsonProperty("targetLinkId")] public string TargetLinkId { get; set; } = "";
        [JsonProperty("direction")] public string Direction { get; set; } = "";
    }
}
