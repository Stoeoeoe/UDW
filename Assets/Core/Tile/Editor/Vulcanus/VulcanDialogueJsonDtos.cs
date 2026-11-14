using Newtonsoft.Json;

namespace Core.Tile.Editor.Vulcanus
{
    internal class DialogueTypeDto
    {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("name")] public string Name { get; set; }
        [JsonProperty("description")] public string Description { get; set; }
    }
}
