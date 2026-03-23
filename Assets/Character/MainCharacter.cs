using Core.Equipment;
using Core.Events;

namespace Character
{
    public class MainCharacter : GameCharacter, IEventListener<ItemSelectedEvent>
    {
        public static MainCharacter _currentMainCharacter;

        public static MainCharacter CurrentMainCharacter
        {
            get
            {
                if (!_currentMainCharacter)
                    _currentMainCharacter = FindFirstObjectByType<MainCharacter>();
                return _currentMainCharacter;
            }
        }

        public int CurrentSelectedSlotIndex { get; protected set; }

        protected override void Awake()
        {
            base.Awake();
            _currentMainCharacter = this;
        }

        protected override void Start()
        {
            base.Start();
            CharacterManager.Instance.RegisterMainCharacter(this);
        }

        protected virtual void OnEnable()
        {
            this.Subscribe<ItemSelectedEvent>();
        }

        protected virtual void OnDisable()
        {
            this.Unsubscribe<ItemSelectedEvent>();
        }

        public void OnEvent(ItemSelectedEvent e)
        {
            SetHeldItem(e.HeldItem);
            CurrentSelectedSlotIndex = e.HotbarSlotIndex;
        }
    }
}