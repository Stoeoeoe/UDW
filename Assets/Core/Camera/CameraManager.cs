using System;
using Character;
using Core.Events;
using Core.Location;
using Core.Tile;
using Unity.Cinemachine;
using UnityEngine;

namespace Core.Camera
{
    /// <summary>
    /// Scene-level camera manager.
    /// Assign the player-follow VCam in the Inspector. It will automatically set its Follow
    /// target when the main character registers (or changes), giving you player-follow for free.
    ///
    /// Cutscene pattern: call ActivateVCam(cutsceneCam) to push it over the player cam via
    /// priority, then DeactivateVCam when done to hand control back.
    /// </summary>
    public class CameraManager : Singleton<CameraManager>, IEventListener<MainCharacterChangedEvent>, ILocationLifecycle
    {
        [Tooltip("The virtual camera used to follow the player. Auto-discovered if left empty.")] [SerializeField]
        private CinemachineCamera playerFollowVCam;

        [Tooltip("Base priority of the player follow cam. Cutscene cams should use a higher value.")] [SerializeField]
        private int playerFollowPriority = 10;

        [SerializeField] CinemachineConfiner2D confiner;

        protected override void OnAwake()
        {
            if (playerFollowVCam == null)
                playerFollowVCam = FindFirstObjectByType<CinemachineCamera>();

            if (playerFollowVCam != null)
                playerFollowVCam.Priority = playerFollowPriority;

            // In case the player already exists (e.g. persistent character, re-loaded scene)
            var existing = MainCharacter.CurrentMainCharacter;
            if (existing != null)
                FollowTarget(existing.transform);
        }

        private void OnEnable()
        {
            this.Subscribe();
            LevelManager.Instance.RegisterLifecycle(this);
        }

        private void OnDisable()
        {
            this.Unsubscribe();
            LevelManager.Instance.UnregisterLifecycle(this);
        }

        public void OnEvent(MainCharacterChangedEvent e)
        {
            if (e.MainCharacter)
                FollowTarget(e.MainCharacter.transform);
        }

        // ── Public API ────────────────────────────────────────────────────────────

        /// <summary>Points the player follow cam at the given transform.</summary>
        public void FollowTarget(Transform target)
        {
            if (playerFollowVCam)
                playerFollowVCam.Follow = target;
        }

        /// <summary>Detaches the player follow cam (camera freezes in place).</summary>
        public void StopFollowing()
        {
            if (playerFollowVCam != null)
                playerFollowVCam.Follow = null;
        }

        /// <summary>
        /// Activates a vcam at the given priority, making it the live cam.
        /// Default priority (20) beats the player follow cam (10).
        /// </summary>
        public void ActivateVCam(CinemachineCamera vcam, int priority = 20)
        {
            if (vcam != null)
                vcam.Priority = priority;
        }

        /// <summary>Returns a vcam to inactive state (priority 0), restoring player follow.</summary>
        public void DeactivateVCam(CinemachineCamera vcam)
        {
            if (vcam != null)
                vcam.Priority = 0;
        }

        public void OnLocationEnter(LocationData location)
        {
            if (confiner == null) return;

            var bounds = MapManager.Instance.CurrentBounds;
            var mapCollider = confiner.BoundingShape2D as BoxCollider2D;
            if (!mapCollider)
            {
                throw new InvalidOperationException("Map collider is not a box collider.");
            }
            // Ignore empty bounds
            if (bounds.size == Vector3.zero) return;

            // Convert world-space center/size into the collider's local space (account for lossy scale)
            var colliderTransform = mapCollider.transform;
            var localCenter = colliderTransform.InverseTransformPoint(bounds.center);

            // BoxCollider2D.size is expressed in local space units. To convert from world size, divide by lossyScale.
            var lossy = colliderTransform.lossyScale;
            var localSize = new Vector2(
                (lossy.x != 0f) ? bounds.size.x / lossy.x : bounds.size.x,
                (lossy.y != 0f) ? bounds.size.y / lossy.y : bounds.size.y
            );

            mapCollider.size = localSize;
            mapCollider.offset = localCenter; 
            // TODO: Check if we really always need to call this? Expensive operation, apparently!
            confiner.InvalidateBoundingShapeCache();
            if (!confiner.BoundingShapeIsBaked)
            {
                // Ensure we have a valid vcam to bake with; try to auto-find if not assigned
                var bakeCam = playerFollowVCam ?? FindFirstObjectByType<CinemachineCamera>();
                confiner.BakeBoundingShape(bakeCam, 5);
            }
            
            // Also follow character
            var character = MainCharacter.CurrentMainCharacter;
            if (character)
            {
                FollowTarget(character.transform);
            }
        }

        public void OnLocationLeave(LocationData location)
        {
        }
    }
}