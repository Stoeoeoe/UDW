namespace Interaction.Tools
{
    /// <summary>How a tool picks the tiles it affects.</summary>
    public enum ToolTargeting
    {
        /// <summary>The tiles around the character set by the effect configuration, turned to face where the character looks.</summary>
        Facing = 0,
        /// <summary>The single tile under the pointer, within the tool's pointer range of the character.</summary>
        Pointer = 1,
    }
}
