using Character;
using Core.Inventory;
using DG.Tweening;
using UnityEngine;
using UnityEngine.Rendering;

namespace Core.Items
{
    /// <summary>
    /// A dropped item in the world.
    /// Magnet settings and fade config come from ItemManager. Visual is spawned from
    /// ItemDefinition.WorldRepresentationPrefab (or a generated sprite child if none is set).
    /// Movement uses an AnimationCurve for speed vs. approach distance.
    /// Fade uses DOTween. Sound plays via MMSfxEvent on pickup.
    /// </summary>
    public class WorldItem : MonoBehaviour
    {
        [SerializeField] private ItemDefinition item;
        [SerializeField] private int quantity = 1;

        private CircleCollider2D _magnetCollider;
        private WorldItemVisual _visual;
        private SpriteRenderer _spriteRenderer; // on the visual child, used for fading
        private GameCharacter _character;
        private Transform _target; // player collider transform
        private bool _isFading;
        private Tween _fadeTween;
        private bool _hasSetup;
        private float _pickupAvailableAt;
        public void DelayPickup(float seconds) => _pickupAvailableAt = Time.unscaledTime + Mathf.Max(0, seconds);

        public ItemDefinition Item => item;
        public int Quantity => quantity;

        public static WorldItem CreateInactive(ItemDefinition definition, int amount, Vector3 position,
            WorldItem prefab = null, float pickupDelay = 0f)
        {
            var staging = new GameObject("Item initialization");
            staging.SetActive(false);
            GameObject root = null;
            try
            {
                WorldItem drop;
                if (prefab)
                {
                    drop = Instantiate(prefab, position, Quaternion.identity, staging.transform);
                    root = drop.gameObject;
                    root.SetActive(false);
                }
                else
                {
                    root = new GameObject(definition.ItemName + " drop");
                    root.SetActive(false);
                    root.transform.SetParent(staging.transform, false);
                    root.transform.position = position;
                    drop = root.AddComponent<WorldItem>();
                }
                drop.Initialize(definition, amount);
                drop.DelayPickup(pickupDelay);
                root.transform.SetParent(null, true);
                return drop;
            }
            catch
            {
                if (root) DestroyDropObject(root);
                throw;
            }
            finally { DestroyDropObject(staging); }
        }

        private static void DestroyDropObject(GameObject root)
        {
            if (Application.isPlaying) Destroy(root);
            else DestroyImmediate(root);
        }

        /// <summary>Called by spawners/loot systems to configure after Instantiate.</summary>
        public void Initialize(ItemDefinition itemDefinition, int qty)
        {
            item = itemDefinition;
            quantity = qty;
            Setup();
        }

        private void Awake()
        {
            if (!_hasSetup) Setup();
        }

        private void Setup()
        {
            if (!item) return;

            var mgr = ItemManager.Instance;

            // ── Magnet collider ──────────────────────────────────────────────────────
            if (!_magnetCollider) _magnetCollider = GetComponent<CircleCollider2D>();
            if (!_magnetCollider) _magnetCollider = gameObject.AddComponent<CircleCollider2D>();
            _magnetCollider.isTrigger = true;
            _magnetCollider.radius = mgr != null ? mgr.MagnetRadius : 2.5f;

            // ── Visual ───────────────────────────────────────────────────────────────
            var existing = transform.Find("Visual");
            if (existing != null)
            {
                existing.gameObject.SetActive(false);
                if (Application.isPlaying) Destroy(existing.gameObject);
                else DestroyImmediate(existing.gameObject);
            }

            GameObject visualGo;
            if (item.WorldRepresentationPrefab != null)
            {
                visualGo = Instantiate(item.WorldRepresentationPrefab, transform);
                visualGo.name = "Visual";
            }
            else
            {
                visualGo = new GameObject("Visual");
                visualGo.transform.SetParent(transform, false);
                var sr = visualGo.AddComponent<SpriteRenderer>();
                sr.sprite = item.Icon;
            }

            // ── Sorting ──────────────────────────────────────────────────────────────
            var sortingGroup = GetComponent<SortingGroup>();
            if (!sortingGroup) sortingGroup = gameObject.AddComponent<SortingGroup>();
            sortingGroup.sortingOrder = 9999;

            _visual = visualGo.GetComponent<WorldItemVisual>();
            _spriteRenderer = visualGo.GetComponentInChildren<SpriteRenderer>();
            _hasSetup = true;
        }

        private void Update()
        {
            if (Time.unscaledTime < _pickupAvailableAt) return;
            if (!_target) return;

            var mgr = ItemManager.Instance;
            var targetPosition = _character.CharacterCenter.position;

            float dist = Vector2.Distance(transform.position, targetPosition);

            if (dist <= mgr.PickupRadius)
            {
                TryPickup();
                return;
            }

            // ── Fade ─────────────────────────────────────────────────────────────────
            if (dist <= mgr.FadeStartDistance)
            {
                var canPickUp = _character.MainInventory.Storage.CanAdd(item, quantity);
                if (!canPickUp) CancelFade();
                else if (!_isFading)
                    StartFade(mgr.FadeDuration);
            }

            // ── Movement (curve-driven) ───────────────────────────────────────────────
            float speed = mgr.EvaluateSpeed(dist);
            transform.position = Vector3.MoveTowards(transform.position, targetPosition, speed * Time.deltaTime);
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if (_target != null) return;
            if (!other.CompareTag("Player")) return;

            _target = other.transform;
            _character = other.GetComponentInParent<GameCharacter>();
            _visual?.PlayEnterZone();
        }

        private void OnTriggerExit2D(Collider2D other)
        {
            if (other.transform != _target) return;

            _target = null;
            _character = null;
            CancelFade();
        }

        private void TryPickup()
        {
            if (!item || _character == null) return;
            if (!_character.MainInventory.AddItem(item, quantity))
            {
                CancelFade(); // Capacity may change after the approach fade began. Keep the drop visible.
                return; // full — retry next frame
            }

            _visual?.PlayPickup();
            ItemManager.Instance?.PlayPickupSound(item.PickupSound);
            Destroy(gameObject);
        }

        private void StartFade(float duration)
        {
            _isFading = true;
            _fadeTween?.Kill();

            if (_spriteRenderer != null)
                _fadeTween = _spriteRenderer.DOFade(0f, duration).SetEase(Ease.InQuad);
        }

        private void CancelFade()
        {
            _fadeTween?.Kill();
            _isFading = false;

            if (_spriteRenderer != null)
            {
                var c = _spriteRenderer.color;
                c.a = 1f;
                _spriteRenderer.color = c;
            }
        }

        private void OnDestroy() => _fadeTween?.Kill();


#if UNITY_EDITOR
        private static Texture2D _itemGizmoTexture;
        private static Texture2D _xGizmoTexture;

        private void OnDrawGizmos()
        {
            _itemGizmoTexture ??=
                UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/EditorUI/Resources/item_gizmo.png");
            _xGizmoTexture ??=
                UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/EditorUI/Resources/x_gizmo.png");

            string label = item != null
                ? (string.IsNullOrEmpty(item.ItemName) ? item.name : item.ItemName)
                : "No Item";

            var centeredStyle = new GUIStyle(GUI.skin.label)
            {
                alignment = TextAnchor.MiddleCenter,
                normal =
                {
                    textColor = Color.white
                }
            };

            UnityEditor.Handles.Label(transform.position, label, centeredStyle);
        }
#endif
    }
}
