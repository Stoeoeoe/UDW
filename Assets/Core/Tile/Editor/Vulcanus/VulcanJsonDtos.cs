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
        [JsonProperty("defaultDialogueContextTypeId")] public string DefaultDialogueContextTypeId { get; set; }
        [JsonProperty("dialogueTypes")] public List<DialogueTypeDto> DialogueTypes { get; set; } = new();
        [JsonProperty("gameVariables")] public List<GameVariableDto> GameVariables { get; set; } = new();
        [JsonProperty("scriptFunctions")] public List<ScriptFunctionDto> ScriptFunctions { get; set; } = new();
        [JsonProperty("scriptNamespaces")] public List<ScriptNamespaceDto> ScriptNamespaces { get; set; } = new();
        [JsonProperty("scriptContextTypes")] public List<ScriptContextTypeDto> ScriptContextTypes { get; set; } = new();
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
        [JsonProperty("description")] public string Description { get; set; } = "";
        [JsonProperty("icon")] public string Icon { get; set; } = "";
        [JsonProperty("placeholderColor")] public string PlaceholderColor { get; set; } = "";
        [JsonProperty("placeholderIcon")] public string PlaceholderIcon { get; set; } = "";
        [JsonProperty("properties")] public List<PropertyDefinitionDto> Properties { get; set; } = new();
        [JsonProperty("defaultSize")] public List<int> DefaultSize { get; set; } = new();
        [JsonProperty("sprite")] public EntitySpriteDto Sprite { get; set; }
        [JsonProperty("folderPath")] public string FolderPath { get; set; } = "";
    }

    internal class EntitySpriteDto
    {
        [JsonProperty("path")] public string Path { get; set; } = "";
    }

    // ── Tileset ───────────────────────────────────────────────────────────────

    internal class TilesetDto
    {
        [JsonProperty("version")] public int Version { get; set; } = 1;
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("spriteSheet")] public string SpriteSheet { get; set; }
        [JsonProperty("columns")] public int Columns { get; set; } = 1;
        [JsonProperty("tileCount")] public int TileCount { get; set; }

        // Keyed by tile-index string ("16", "17", …); sparse — missing entries are default tiles.
        [JsonProperty("tiles")] public Dictionary<string, TileMetaDto> Tiles { get; set; } = new();
        [JsonProperty("objects")] public List<TilesetObjectDefinitionDto> Objects { get; set; } = new();
        [JsonProperty("folderPath")] public string FolderPath { get; set; } = "";
    }

    internal class TileMetaDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("terrain")] public string Terrain { get; set; }
        [JsonProperty("terrainCorners")] public List<string> TerrainCorners { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; }
        [JsonProperty("collision")] public CollisionDto Collision { get; set; }
        [JsonProperty("properties")] public List<PropertyInstanceDto> Properties { get; set; } = new();
        [JsonProperty("pivotY")] public float? PivotY { get; set; }
    }

    internal class CollisionDto
    {
        [JsonProperty("type")] public string Type { get; set; } = "";
        [JsonProperty("shapes")] public List<CollisionShapeDto> Shapes { get; set; } = new();
    }

    internal class CollisionShapeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("type")] public string Type { get; set; }
        [JsonProperty("points")] public List<List<float>> Points { get; set; } = new();
        [JsonProperty("x")] public float? X { get; set; }
        [JsonProperty("y")] public float? Y { get; set; }
        [JsonProperty("width")] public float? Width { get; set; }
        [JsonProperty("height")] public float? Height { get; set; }
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
        [JsonProperty("version")] public int Version { get; set; } = 1;
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("width")] public int Width { get; set; } = 1;
        [JsonProperty("height")] public int Height { get; set; } = 1;
        [JsonProperty("baseTilesetId")] public string BaseTilesetId { get; set; }
        [JsonProperty("tilesetRefs")] public List<string> TilesetRefs { get; set; } = new();
        [JsonProperty("layers")] public List<LayerDto> Layers { get; set; } = new();
        [JsonProperty("entities")] public List<EntityInstanceDto> Entities { get; set; } = new();
        [JsonProperty("locationLinks")] public List<LocationLinkDto> LocationLinks { get; set; } = new();
        [JsonProperty("metadata")] public MapMetadataDto Metadata { get; set; }
        [JsonProperty("spatialPrimitives")] public SpatialPrimitivesDto SpatialPrimitives { get; set; }
        [JsonProperty("folderPath")] public string FolderPath { get; set; } = "";
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
        [JsonProperty("collisions")] public List<MapCollisionDto> Collisions { get; set; } = new();
        [JsonProperty("paths")] public List<PathDto> Paths { get; set; } = new();
        [JsonProperty("areas")] public List<AreaDto> Areas { get; set; } = new();
    }

    internal class MapCollisionDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("shape")] public string Shape { get; set; } = "rectangle";
        [JsonProperty("position")] public List<float> Position { get; set; }
        [JsonProperty("size")] public List<float> Size { get; set; }
        [JsonProperty("radius")] public float Radius { get; set; }
        [JsonProperty("points")] public List<List<float>> Points { get; set; } = new();
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
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
        [JsonProperty("id")] public string Id { get; set; } = "";
        [JsonProperty("name")] public string Name { get; set; } = "Layer";
        [JsonProperty("kind")] public string Kind { get; set; } = "visual";
        [JsonProperty("locked")] public bool Locked { get; set; }
        [JsonProperty("zOrder")] public int ZOrder { get; set; }
        [JsonProperty("sortingLayer")] public string SortingLayer { get; set; }
        [JsonProperty("opacity")] public float Opacity { get; set; } = 1f;
        [JsonProperty("visible")] public bool Visible { get; set; } = true;
        [JsonProperty("icon")] public string Icon { get; set; }
        [JsonProperty("definitionId")] public string DefinitionId { get; set; }

        // Tile layers: either a 2-D array (dense) or a sparse object.
        [JsonProperty("data")] public Newtonsoft.Json.Linq.JToken Data { get; set; }

        [JsonProperty("terrainData")] public Newtonsoft.Json.Linq.JArray TerrainData { get; set; }
        [JsonProperty("terrainPalette")] public List<string> TerrainPalette { get; set; }

        [JsonProperty("entities")] public List<EntityInstanceDto> Entities { get; set; } = new();

        [JsonProperty("objectGroups")] public List<ObjectGroupDto> ObjectGroups { get; set; } = new();
        // Object layers (kind == "object")
        [JsonProperty("objectInstances")] public List<MapObjectInstanceDto> ObjectInstances { get; set; } = new();
    }

    internal class ObjectGroupDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("tiles")] public List<ObjectGroupTileDto> Tiles { get; set; } = new();
    }

    internal class ObjectGroupTileDto
    {
        [JsonProperty("x")] public int X { get; set; }
        [JsonProperty("y")] public int Y { get; set; }
        [JsonProperty("tilesetId")] public string TilesetId { get; set; }
        [JsonProperty("tileIndex")] public int TileIndex { get; set; }
    }

    internal class MapObjectInstanceDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("tilesetId")] public string TilesetId { get; set; }
        [JsonProperty("objectDefinitionId")] public string ObjectDefinitionId { get; set; }
        [JsonProperty("x")] public int X { get; set; }
        [JsonProperty("y")] public int Y { get; set; }
    }

    internal class TilesetObjectDefinitionDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("tiles")] public List<TilesetObjectTileDto> Tiles { get; set; } = new();
    }

    internal class TilesetObjectTileDto
    {
        [JsonProperty("x")] public int X { get; set; }
        [JsonProperty("y")] public int Y { get; set; }
        [JsonProperty("tileIndex")] public int TileIndex { get; set; }
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
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
        [JsonProperty("timeScope")] public TimeScopeDto TimeScope { get; set; }
    }

    internal class TimeScopeDto
    {
        [JsonProperty("startTime")] public float StartTime { get; set; }
        [JsonProperty("endTime")] public float EndTime { get; set; }
        [JsonProperty("seasons")] public List<string> Seasons { get; set; } = new();
    }

    internal class PathDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("points")] public List<List<float>> Points { get; set; } = new();
        [JsonProperty("closed")] public bool Closed { get; set; }
        [JsonProperty("width")] public float Width { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
    }

    internal class AreaDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("shape")] public string Shape { get; set; }
        [JsonProperty("points")] public List<List<float>> Points { get; set; } = new();
        [JsonProperty("priority")] public int Priority { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
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
