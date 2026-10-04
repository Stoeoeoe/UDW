using System;
using Core.Game;
using Interaction;
using UnityEngine;

namespace Core.Spawning
{
    /// <summary>Saved reconstruction data. Derive from this for chest contents or other entity data.</summary>
    [Serializable]
    public class SpawnedObjectState : WorldObjectState
    {
        public string prefabId;
        public Vector3 position;
        public Quaternion rotation = Quaternion.identity;
        public bool authored;
        public bool removed;
        public InteractableState interaction = new();
    }
}
