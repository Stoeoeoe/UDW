using System;
using Character;
using Core.Inventory;
using UI.Containers;
using UnityEngine;

namespace Interaction
{
    [RequireComponent(typeof(PersistentContainer))]
    public sealed class ContainerInteractable : AbstractInteractable
    {
        private PersistentContainer _container;
        private ContainerScreen _screen;
        protected override void Awake()
        {
            base.Awake();
            _container = GetComponent<PersistentContainer>();
            ValidateConfiguration();
            _screen = ContainerScreen.Instance;
        }

        public void ValidateConfiguration()
        {
            if (!UnlimitedActivations || cooldownMode != InteractionCooldownMode.None || !RequiresButtonPress)
                throw new InvalidOperationException("Container interactions require button activation, unlimited uses and no cooldown.");
            if (!GetComponent<Collider2D>().isTrigger)
                throw new InvalidOperationException("A container interaction collider must be a trigger.");
        }

        protected override bool Interact(GameCharacter instigator)
        {
            _screen.Open(_container, instigator);
            return true;
        }
    }
}
