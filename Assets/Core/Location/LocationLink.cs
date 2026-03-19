using Character;
using Interaction;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Core.Location
{
    public class LocationLink : AbstractInteractable
    {
        [field: SerializeField] public string TargetLocation { get; private set; }
        [field: SerializeField] public LocationLinkType LinkType { get; private set; }
        /// <summary>
        /// The name of the level this link is located in. Used to identify point of entry. For places with a single entry
        /// point, this can be null or empty.
        /// </summary>
        [field: SerializeField] public string Key { get; private set; }

        [field: SerializeField] public MoreMountains.TopDownEngine.Character.FacingDirections ExitFacingDirection;

        private void Start()
        {
            if (LinkType == LocationLinkType.Open)
            {
                buttonActivated.enabled = true;     // We don't need the "button" if it's jut a walk-in link
            }
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if (LinkType != LocationLinkType.Door) return;

            var character = other.GetComponent<MainCharacter>();
            if (character == null) return;

            Interact(character);
        }

        protected override void Interact(UrCharacter instigator)
        {
            var levelManager = UrLevelManager.Current as UrLevelManager;
            var location = levelManager!.GetLocationDataById(TargetLocation);
            levelManager.CurrentTargetEntry = this.Key;
            // GameManager.Instance.StoreSelectedCharacter (MainCharacter.CurrentMainCharacter);
            levelManager.GotoLevel(location.sceneReference.Name);
//            MainCharacter.CurrentMainCharacter.RespawnAt();
        }
    }
}