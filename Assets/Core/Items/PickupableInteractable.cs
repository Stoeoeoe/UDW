using System.Collections;
using Character;
using Character.Animations;
using Core.Events;
using Core.Inventory;
using Interaction;
using UnityEngine;
using VContainer;

namespace Core.Items
{
    /// <summary>A forage stack collected deliberately, rather than by the dropped-item magnet.</summary>
    public sealed class PickupableInteractable : AbstractInteractable, IEventListener<InventoryChangedEvent>
    {
        [Inject] private ItemManager _itemManager;

        [SerializeField] private ForageableItem item;
        [SerializeField, Min(1)] private int quantity = 1;
        [SerializeField] private CharacterAnimation pickupAnimation;
        [SerializeField] private Transform visual;
        [SerializeField, Min(0.01f)] private float liftDuration = 0.35f;
        [SerializeField, Min(0f)] private float liftHeight = 0.6f;

        private ForagePickup _spawn;
        private SpriteRenderer[] _sprites;
        private Color[] _colors;
        private Vector3 _restPosition;
        private Coroutine _routine;
        private GameCharacter _collector;
        private UrCharacterAnimator.OneShotPlayback _playback;
        private bool _collected;
        public ForageableItem Item => item;
        public bool IsPickingUp => _collector != null;
        public override bool RequiresButtonPress => true;

        // LevelManager initializes the player before materializing location objects.
        public override bool CanInteract => base.CanInteract && CanPickUp(_characterManager.MainCharacter);

        /// <summary>Whether the forage is still here and fits the bag; reach is the shared interaction targeting rule.</summary>
        public bool CanPickUp(GameCharacter character) =>
            isActiveAndEnabled && !_spawn.IsExpired && !_collected && !IsPickingUp &&
            character.MainInventory.Storage.CanAdd(item, quantity);

        protected override void Awake()
        {
            base.Awake();
            _spawn = GetComponent<ForagePickup>();
            _sprites = visual.GetComponentsInChildren<SpriteRenderer>(true);
            _colors = new Color[_sprites.Length];
            for (var i = 0; i < _sprites.Length; i++) _colors[i] = _sprites[i].color;
            _restPosition = visual.localPosition;
        }

        protected override void OnEnable()
        {
            base.OnEnable();
            EventBus<InventoryChangedEvent>.Subscribe(this);
        }

        protected override void OnDisable()
        {
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            CancelPickup();
            base.OnDisable();
        }

        public void OnEvent(InventoryChangedEvent change) => InteractableStateChangedEvent.Trigger(this, RemainingUses);

        protected override bool Interact(GameCharacter instigator)
        {
            if (!CanPickUp(instigator)) return false;
            _collector = instigator;
            _routine = StartCoroutine(Collect());
            return true;
        }

        private IEnumerator Collect()
        {
            try
            {
                _collector.SetControlBlocked(this, true);
                _playback = _collector.Animator.PlayOneShot(pickupAnimation);
                while (!_playback.IsCompleted)
                {
                    if (_playback.IsInterrupted) yield break;
                    yield return null;
                }
                _itemManager.PlayPickupSound(item.PickupSound);
                for (float elapsed = 0; elapsed < liftDuration; elapsed += Time.deltaTime)
                {
                    if (_playback.IsInterrupted) yield break;
                    var t = elapsed / liftDuration;
                    visual.localPosition = _restPosition + Vector3.up * (liftHeight * t);
                    for (var i = 0; i < _sprites.Length; i++)
                    {
                        var color = _colors[i];
                        color.a *= 1f - t;
                        _sprites[i].color = color;
                    }
                    yield return null;
                }
                var inventory = _collector.MainInventory;
                if (_spawn.IsExpired) yield break;
                // Capacity can change during the animation. Failed collection leaves the entire forage stack intact.
                if (!inventory.Storage.AddItem(item, quantity)) yield break;
                // Both saved records are committed before inventory listeners can save or attempt another pickup.
                _collected = true;
                visual.gameObject.SetActive(false);
                _spawn.Remove();
                InventoryChangedEvent.Trigger(inventory);
            }
            finally { ReleasePickup(); }
        }

        public void CancelPickup()
        {
            if (_routine != null) StopCoroutine(_routine);
            ReleasePickup();
        }

        private void ReleasePickup()
        {
            _routine = null;
            if (ReferenceEquals(_collector, null)) return;
            _playback?.Dispose();
            _playback = null;
            _collector.SetControlBlocked(this, false);
            _collector = null;
            if (!_collected)
            {
                visual.localPosition = _restPosition;
                for (var i = 0; i < _sprites.Length; i++) _sprites[i].color = _colors[i];
            }
            InteractableStateChangedEvent.Trigger(this, RemainingUses);
        }
    }
}
