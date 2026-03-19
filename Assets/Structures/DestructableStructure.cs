using System;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Structures
{
    [RequireComponent(typeof(Health))]
    public class DestructableStructure : Structure, IRepairable
    {
        private Health _health;

        private void Awake()
        {
            this._health = GetComponent<Health>();
        }

        public void FullyRepair()
        {
            _health.SetHealth(_health.MaximumHealth);
        }
        
        public void Repair(int addedHealth)
        {
            _health.ReceiveHealth(addedHealth, null);
        }

        public void Damage(int removedHealth)
        {
            _health.Damage(removedHealth, null, 0.0f, 0.0f, Vector3.zero);
        }
    }
}