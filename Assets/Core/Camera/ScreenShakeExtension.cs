using Unity.Cinemachine;
using UnityEngine;

namespace Core.Camera
{
    /// <summary>Adds a transient camera-space correction without changing follow or authored transforms.</summary>
    public sealed class ScreenShakeExtension : CinemachineExtension
    {
        private CameraManager _manager;
        internal void Bind(CameraManager manager) => _manager = manager;

        protected override void PostPipelineStageCallback(CinemachineVirtualCameraBase vcam,
            CinemachineCore.Stage stage, ref CameraState state, float deltaTime)
        {
            // The camera may outlive its scene manager during a location transition.
            if (stage == CinemachineCore.Stage.Noise && _manager)
                state.PositionCorrection += state.RawOrientation * _manager.ShakeOffset;
        }
    }
}
