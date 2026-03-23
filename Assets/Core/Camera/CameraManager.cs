using Character;
using Core.Events;
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
    public class CameraManager : Singleton<CameraManager>, IEventListener<MainCharacterChangedEvent>
    {
        [Tooltip("The virtual camera used to follow the player. Auto-discovered if left empty.")]
        [SerializeField]
        private CinemachineCamera playerFollowVCam;

        [Tooltip("Base priority of the player follow cam. Cutscene cams should use a higher value.")]
        [SerializeField]
        private int playerFollowPriority = 10;

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

        void OnEnable()  => this.Subscribe<MainCharacterChangedEvent>();
        void OnDisable() => this.Unsubscribe<MainCharacterChangedEvent>();

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
    }
}
