using System.Collections.Generic;
using Newtonsoft.Json;

namespace Core.Tile.Editor.Vulcan
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
    }

    internal class CollisionDto
    {
        [JsonProperty("type")] public string Type { get; set; } = "";
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

        // Kept as raw token — reflected into MonoBehaviour fields by VulcanEntityInitializer.
        [JsonProperty("properties")] public Newtonsoft.Json.Linq.JToken Properties { get; set; }
    }

    internal class LocationLinkDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("label")] public string Label { get; set; } = "";
        [JsonProperty("sourcePosition")] public List<int> SourcePosition { get; set; }
        [JsonProperty("triggerSize")] public List<int> TriggerSize { get; set; }
        [JsonProperty("targetMapId")] public string TargetMapId { get; set; } = "";
        [JsonProperty("targetPosition")] public List<int> TargetPosition { get; set; }
        [JsonProperty("targetLinkId")] public string TargetLinkId { get; set; } = "";
        [JsonProperty("direction")] public string Direction { get; set; } = "";
    }
}
