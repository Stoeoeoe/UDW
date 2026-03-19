using Character;
using MoreMountains.Tools;
using UnityEngine;

namespace Interaction
{
    public class InteractionSphere : MonoBehaviour
    {
        [SerializeField] protected UrTopDownController2D controller;
        [SerializeField] protected MMConeOfVision2D coneOfVision2D;
        [SerializeField] protected UrCharacter owner;

        private AbstractInteractable _lastInteractable;


        public AbstractInteractable GetClosestInteractable()
        {
            // TODO: Verify if it's really the closest
            return coneOfVision2D.VisibleTargets.Count == 0
                ? null
                : coneOfVision2D.VisibleTargets?[0].GetComponent<AbstractInteractable>();
        }

        private void Update()
        {
            var angles = new Vector3(0f, 0f, Vector2.SignedAngle(Vector2.up, controller.CurrentDirection));
            coneOfVision2D.SetDirectionAndAngles(controller.CurrentDirection, angles);
            var currentInteractable = GetClosestInteractable();
            if (currentInteractable != _lastInteractable)
            {
                InteractableChangedEvent.Trigger(currentInteractable, owner);
                _lastInteractable = currentInteractable;
            }
        }
    }
}