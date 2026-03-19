using System.Linq;
using Character;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Interaction
{
    public class InteractableButtonActivated : ButtonActivated
    {
        private AbstractInteractable _interactable;

        public void Initialize(AbstractInteractable interactable)
        {
            this._interactable = interactable;
        }
        
        protected override void ActivateZone()
        {
            var instigator = _collidingObjects.First().GetComponent<UrCharacter>();
            if (instigator.InteractionSphere.GetClosestInteractable() == _interactable)
            {
                base.ActivateZone();
            }
        }
        
        public UrCharacter Instigator => _collidingObjects.First().GetComponent<UrCharacter>();
        
        private void OnDrawGizmos()
        {
            // Draw the collider bounds
            Gizmos.color = Color.blue;
            switch (_collider2D)
            {
                case BoxCollider2D boxCollider:
                    Gizmos.DrawWireCube(boxCollider.bounds.center, boxCollider.bounds.size);
                    break;
                case CircleCollider2D circleCollider:
                    Gizmos.DrawWireSphere(circleCollider.bounds.center, circleCollider.radius);
                    break;
            }
        }
        
    }
}