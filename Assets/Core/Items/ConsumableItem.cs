using Core.Inventory;

namespace Items
{
    /// <summary>
    /// Base class for all consumable items.
    /// Definitions provide validation and effects; inventory removal is committed before applying them.
    /// </summary>
    public abstract class ConsumableItem : ItemDefinition
    {
        public abstract bool CanConsume(Character.GameCharacter character);
        // Effects publish only after inventory ownership has been committed.
        public abstract void Apply(Character.GameCharacter character);
    }
}
