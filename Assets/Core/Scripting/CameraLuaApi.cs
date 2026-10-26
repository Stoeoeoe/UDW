using System;
using Core.Camera;
using UnityEngine;
using UnityEngine.Scripting;

namespace Core.Scripting
{
    [LuaModule("Camera")]
    public sealed class CameraLuaApi
    {
        private readonly CameraManager _manager;
        public CameraLuaApi(CameraManager manager)
        {
            _manager = manager ? manager : throw new InvalidOperationException("Camera effects require the initialized CameraManager.");
            _manager.PrepareShake();
            _manager.PrepareFlash();
        }

        internal static CameraLuaApi BindCurrentCamera() => new(CameraManager.Instance);

        [Preserve]
        public static void ValidateShake(double durationSeconds, double strength) => CameraManager.ValidateShake(durationSeconds, strength);

        [LuaAction("camera.shake", "Screen shake", "Camera",
            "Shake the screen for gameplay seconds, fading out. Strength is in world units (try 0.1). Continues immediately; a new shake replaces the previous one.",
            "cutscene", Validator = nameof(ValidateShake), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Shake(double durationSeconds, double strength)
        {
            ValidateShake(durationSeconds, strength);
            _manager.Shake((float)durationSeconds, (float)strength);
        }

        [Preserve]
        public static void ValidateFlash(string color, double durationSeconds, double easeInSeconds, double holdSeconds, double easeOutSeconds)
        {
            ParseFlashColor(color);
            CameraManager.ValidateFlash(durationSeconds, easeInSeconds, holdSeconds, easeOutSeconds);
        }

        private static Color ParseFlashColor(string color)
        {
            if (!ColorUtility.TryParseHtmlString(color, out var parsed))
                throw new ArgumentException("Flash color must be an HTML color such as #FFFFFF or #FF000080.", nameof(color));
            return parsed;
        }

        [LuaAction("camera.flash", "Screen flash", "Camera",
            "Flash the screen with an HTML color. Uses real seconds, including while paused. Phase times scale to durationSeconds. Defaults: white, 0.3 seconds total, 0.05 in / 0.2 hold / 0.05 out. Continues immediately; a new flash replaces the previous one.",
            "cutscene", Validator = nameof(ValidateFlash), Phases = new[] { "setup", "sequence", "completion" })]
        [LuaPreview(LuaPreviewSpatialState.Described)]
        public void Flash(string color = "#FFFFFF", double durationSeconds = 0.3, double easeInSeconds = 0.05,
            double holdSeconds = 0.2, double easeOutSeconds = 0.05)
        {
            ValidateFlash(color, durationSeconds, easeInSeconds, holdSeconds, easeOutSeconds);
            _manager.Flash(ParseFlashColor(color), (float)durationSeconds, (float)easeInSeconds, (float)holdSeconds, (float)easeOutSeconds);
        }
    }
}
