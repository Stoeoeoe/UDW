using System.Collections.Generic;
using Newtonsoft.Json;

namespace Core.Tile.Editor.Vulcanus
{
    internal class DialogueDto
    {
        [JsonProperty("version")] public int Version { get; set; } = 1;
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("folderPath")] public string FolderPath { get; set; }
        [JsonProperty("oneShot")] public bool OneShot { get; set; }
        [JsonProperty("dialogueTypeId")] public string DialogueTypeId { get; set; }
        [JsonProperty("startNodeId")] public string StartNodeId { get; set; }
        [JsonProperty("tags")] public List<string> Tags { get; set; } = new();
        [JsonProperty("createdAt")] public string CreatedAt { get; set; }
        [JsonProperty("updatedAt")] public string UpdatedAt { get; set; }
        [JsonProperty("nodes")] public List<DialogueNodeDto> Nodes { get; set; } = new();
    }

    internal class DialogueNodeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("type")] public string Type { get; set; }
        [JsonProperty("speaker")] public string Speaker { get; set; }
        [JsonProperty("emotion")] public string Emotion { get; set; }
        [JsonProperty("text")] public string Text { get; set; }
        [JsonProperty("msgKey")] public string MsgKey { get; set; }
        [JsonProperty("next")] public string Next { get; set; }
        [JsonProperty("options")] public List<DialogueChoiceOptionDto> Options { get; set; } = new();
        [JsonProperty("lua")] public string Lua { get; set; }
        [JsonProperty("targetDialogueId")] public string TargetDialogueId { get; set; }
        [JsonProperty("targetNodeId")] public string TargetNodeId { get; set; }
    }

    internal class DialogueChoiceOptionDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("text")] public string Text { get; set; }
        [JsonProperty("msgKey")] public string MsgKey { get; set; }
        [JsonProperty("condition")] public string Condition { get; set; }
        [JsonProperty("targetNodeId")] public string TargetNodeId { get; set; }
    }

    internal class DialogueI18nDto
    {
        [JsonProperty("dialogueId")] public string DialogueId { get; set; }
        [JsonProperty("dialogueName")] public string DialogueName { get; set; }
        [JsonProperty("generatedAt")] public string GeneratedAt { get; set; }
        [JsonProperty("messages")] public List<DialogueI18nMessageDto> Messages { get; set; } = new();
    }

    internal class DialogueI18nMessageDto
    {
        [JsonProperty("msgKey")] public string MsgKey { get; set; }
        [JsonProperty("text")] public string Text { get; set; }
        [JsonProperty("nodeId")] public string NodeId { get; set; }
        [JsonProperty("sourceType")] public string SourceType { get; set; }
        [JsonProperty("optionId")] public string OptionId { get; set; }
    }

    internal class DialogueTypeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("contextTypeId")] public string ContextTypeId { get; set; }
    }

    internal class GameVariableDto
    {
        [JsonProperty("key")] public string Key { get; set; }
        [JsonProperty("type")] public string Type { get; set; }
        [JsonProperty("category")] public string Category { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("defaultValue")] public Newtonsoft.Json.Linq.JToken DefaultValue { get; set; }
        [JsonProperty("enumValues")] public List<string> EnumValues { get; set; } = new();
        [JsonProperty("tableId")] public string TableId { get; set; }
        [JsonProperty("folderPath")] public string FolderPath { get; set; }
    }

    internal class ScriptParamDto
    {
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("type")] public string Type { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("enumValues")] public List<string> EnumValues { get; set; } = new();
    }

    internal class ScriptFunctionDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("params")] public List<ScriptParamDto> Params { get; set; } = new();
        [JsonProperty("returnType")] public string ReturnType { get; set; }
        [JsonProperty("returnTableId")] public string ReturnTableId { get; set; }
    }

    internal class ScriptNamespaceDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("fields")] public List<GameVariableDto> Fields { get; set; } = new();
        [JsonProperty("functions")] public List<ScriptFunctionDto> Functions { get; set; } = new();
    }

    internal class ScriptContextTypeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
        [JsonProperty("fields")] public List<GameVariableDto> Fields { get; set; } = new();
        [JsonProperty("functions")] public List<ScriptFunctionDto> Functions { get; set; } = new();
    }
}
