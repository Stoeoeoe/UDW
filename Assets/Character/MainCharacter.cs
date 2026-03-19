using Core.Equipment;
using MoreMountains.Tools;

namespace Character
{
    public class MainCharacter : UrCharacter, MMEventListener<ItemSelectedEvent>
    {
        public static MainCharacter _currentMainCharacter;

        public static MainCharacter CurrentMainCharacter
        {
            get
            {
                if (!_currentMainCharacter)
                {
                    _currentMainCharacter = FindFirstObjectByType<MainCharacter>();
                }

                return _currentMainCharacter;
            }
        }
        // public static MainCharacter CurrentMainCharacter { get; private set; }

        private static MainCharacter _instance;
        public int CurrentSelectedSlotIndex { get; protected set; }


        protected override void Awake()
        {
            base.Awake();
            
            
            // (UrLevelManager.Current as UrLevelManager)!.RegisterPlayerCharacter(this);
            // CurrentMainCharacter = this; // Set the static reference, TODO: currently only works for one main character
        }

        protected override void Initialization()
        {
            base.Initialization();
        }

        protected override void OnEnable()
        {
            base.OnEnable();
            this.MMEventStartListening();
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            this.MMEventStopListening();
        }

        public void OnMMEvent(ItemSelectedEvent itemSelectedEvent)
        {
            SetHeldItem(itemSelectedEvent.HeldItem);
            CurrentSelectedSlotIndex = itemSelectedEvent.HotbarSlotIndex;
        }
    }
}