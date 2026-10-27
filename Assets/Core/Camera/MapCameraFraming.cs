using System;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace Core.Camera
{
    /// <summary>Centers oversized viewport axes without changing the camera's zoom.</summary>
    public sealed class MapCameraFraming : CinemachineExtension
    {
        private CinemachineConfiner2D _confiner;
        private PixelPerfectCamera _pixels;
        private Bounds _bounds;
        private float _previousSize;

        public void Bind(CinemachineConfiner2D confiner, Bounds bounds)
        {
            if (!confiner || confiner.gameObject != gameObject || bounds.size.x <= 0 || bounds.size.y <= 0)
                throw new InvalidOperationException("Map camera framing requires its camera's confiner and positive map bounds.");
            var brain = CinemachineCore.FindPotentialTargetBrain(ComponentOwner);
            if (!brain || !brain.OutputCamera
                || !brain.OutputCamera.TryGetComponent(out _pixels) || !_pixels.isActiveAndEnabled
                || !brain.OutputCamera.orthographic || !GetComponent<CinemachinePixelPerfect>())
                throw new InvalidOperationException("Map camera framing requires an output PixelPerfectCamera and a CinemachinePixelPerfect extension.");
            _confiner = confiner;
            _bounds = bounds;
            _previousSize = 0;
            brain.OutputCamera.clearFlags = CameraClearFlags.SolidColor;
            brain.OutputCamera.backgroundColor = Color.black;
        }

        public override void PrePipelineMutateCameraStateCallback(
            CinemachineVirtualCameraBase vcam, ref CameraState state, float deltaTime)
        {
            var size = _pixels.CorrectCinemachineOrthoSize(state.Lens.OrthographicSize);

            // Runs before Pixel Perfect and the confiner's Body callbacks. The package
            // rebuilds for aspect changes itself, but explicitly caches orthographic size.
            if (_previousSize != size)
            {
                _confiner.InvalidateLensCache();
                _previousSize = size;
            }
        }

        protected override void PostPipelineStageCallback(CinemachineVirtualCameraBase vcam,
            CinemachineCore.Stage stage, ref CameraState state, float deltaTime)
        {
            if (stage != CinemachineCore.Stage.Aim) return;
            var halfHeight = state.Lens.OrthographicSize;
            var halfWidth = halfHeight * state.Lens.Aspect;
            if (halfWidth * 2 < _bounds.size.x && halfHeight * 2 < _bounds.size.y) return;

            // The polygon confiner's oversize skeleton does not independently clamp each
            // axis. For our rectangular maps, center only axes smaller than the viewport
            // and follow/clamp the player on the others. Aim follows confinement (Body)
            // and precedes Noise, so screen shake is still applied normally afterwards.
            var position = state.RawPosition;
            position.x = halfWidth * 2 >= _bounds.size.x ? _bounds.center.x
                : Mathf.Clamp(position.x, _bounds.min.x + halfWidth, _bounds.max.x - halfWidth);
            position.y = halfHeight * 2 >= _bounds.size.y ? _bounds.center.y
                : Mathf.Clamp(position.y, _bounds.min.y + halfHeight, _bounds.max.y - halfHeight);
            state.PositionCorrection += position - state.GetCorrectedPosition();
        }
    }
}
