using Core.Inventory;

namespace Items
{
    /// <summary>
    /// Base class for all equippable items. 
    /// Equipping is handled by GameCharacter.SetHeldItem(), not by this class.
    /// </summary>
    public abstract class EquippableItem : ItemDefinition { }
}