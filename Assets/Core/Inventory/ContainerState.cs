using System;
using Core.Spawning;

namespace Core.Inventory
{
    [Serializable]
    public sealed class ContainerState : SpawnedObjectState
    {
        public string OwnerCharacterId;
        public InventoryState Inventory = new();
    }
}
