using Core.Common;
using Interaction;
using UnityEngine;

namespace Core.Spawning
{
    /// <summary>Runtime view of one saved spawn record. The spawner binds it before enabling it.</summary>
    public class SpawnedObject : MonoBehaviour
    {
        [Tooltip("Stable 'namespace:name' ID stored in saves. Never change it once used.")]
        [NamespacedId]
        [SerializeField] private string prefabId;
        public string PrefabId => prefabId;
        public virtual SpawnedObjectState CreateState() => new();

        public string PersistentId { get; private set; }
        public SpawnedObjectState State { get; private set; }
        private WorldObjectSpawner _spawner;

        internal void Bind(WorldObjectSpawner spawner, string id, SpawnedObjectState state)
        {
            _spawner = spawner;
            PersistentId = id;
            State = state;
            var interactable = GetComponentInChildren<AbstractInteractable>(true);
            if (interactable)
            {
                interactable.BindSpawnedState(id, state.interaction);
                interactable.Depleted += Remove;
            }
            OnStateBound();
        }

        /// <summary>Apply concrete entity data here; Awake/OnEnable have not run yet.</summary>
        protected virtual void OnStateBound() { }

        /// <summary>Permanent gameplay removal; authored entities retain a saved removal marker.</summary>
        public void Remove() => _spawner.Despawn(PersistentId);

        internal void SavePosition()
        {
            State.position = transform.position;
            State.rotation = transform.rotation;
        }
    }
}
