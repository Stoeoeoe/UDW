using Core.Inventory;

namespace Items
{
    /// <summary>
    /// Base class for all equippable items. 
    /// Selection is owned by CharacterLoadout; this asset contains the item definition.
    /// </summary>
    public abstract class EquippableItem : ItemDefinition { }
}