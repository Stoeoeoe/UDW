using System;
using Core.Context;
using Interaction;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.DualShock;
using UnityEngine.UIElements;
using VContainer;

namespace UI.Hud
{
    /// <summary>
    /// Shows the Interact button and the target's verb above the player's current interaction target, such as
    /// "[E] Open". The glyph is the button that uses this target: right click for a hovered target, the Interact key
    /// for the one in front in keyboard and mouse play, or the gamepad's button.
    /// </summary>
    [RequireComponent(typeof(UIDocument)), DisallowMultipleComponent]
    public sealed class InteractionPromptPresenter : MonoBehaviour
    {
        [Inject] private PlayerInteractionContext _context;

        [Header("Interact button glyphs")]
        [Tooltip("Right click: the hovered target.")]
        [SerializeField] private Sprite[] mouse = Array.Empty<Sprite>();
        [Tooltip("Interact key: the target in front, in keyboard and mouse play.")]
        [SerializeField] private Sprite[] keyboard = Array.Empty<Sprite>();
        [SerializeField] private Sprite[] xbox = Array.Empty<Sprite>();
        [SerializeField] private Sprite[] playStation = Array.Empty<Sprite>();
        [SerializeField] private Sprite[] nintendoSwitch = Array.Empty<Sprite>();
        [Tooltip("Gap between the top of the target's art and the prompt, in world units.")]
        [SerializeField, Min(0f)] private float worldGap = 0.25f;

        private VisualElement _prompt;
        private VisualElement _glyphs;
        private Label _verb;
        private Sprite[] _shownGlyphs;

        private void OnEnable()
        {
            if (mouse.Length == 0 || keyboard.Length == 0 || xbox.Length == 0 || playStation.Length == 0 || nintendoSwitch.Length == 0)
                throw new InvalidOperationException("The interaction prompt requires glyphs for every device.");
            var root = GetComponent<UIDocument>().rootVisualElement;
            _prompt = root.Q("interactionPrompt") ?? throw new InvalidOperationException("The HUD requires its interactionPrompt.");
            _glyphs = _prompt.Q("interactionPromptGlyphs");
            _verb = _prompt.Q<Label>("interactionPromptVerb");
            _prompt.style.display = DisplayStyle.None;
            _shownGlyphs = null;
        }

        private void LateUpdate()
        {
            var snapshot = _context.CurrentSnapshot;
            var target = snapshot.ActionableInteractable;
            if (!target)
            {
                _prompt.style.display = DisplayStyle.None;
                return;
            }

            ShowGlyphs(GlyphsFor(snapshot));
            _verb.text = target.Verb.Text;
            var bounds = target.GetVisibleBounds();
            var anchor = new Vector3(bounds.center.x, bounds.max.y + worldGap, bounds.center.z);
            var position = RuntimePanelUtils.CameraTransformWorldToPanel(_prompt.panel, anchor, Camera.main);
            _prompt.style.left = position.x;
            _prompt.style.top = position.y;
            _prompt.style.display = DisplayStyle.Flex;
        }

        private Sprite[] GlyphsFor(PlayerInteractionContextSnapshot snapshot)
        {
            if (snapshot.HoveredTarget) return mouse;
            if (snapshot.UsesPointer) return keyboard;
            return Gamepad.current switch
            {
                DualShockGamepad => playStation, // Also DualSense.
                // The Switch Pro controller type only exists on some platforms, so it is matched by layout name.
                { } pad when pad.layout.Contains("Switch") => nintendoSwitch,
                _ => xbox
            };
        }

        private void ShowGlyphs(Sprite[] glyphs)
        {
            if (glyphs == _shownGlyphs) return;
            _shownGlyphs = glyphs;
            _glyphs.Clear();
            foreach (var glyph in glyphs)
            {
                var image = new VisualElement { pickingMode = PickingMode.Ignore };
                image.AddToClassList("interaction-prompt__glyph");
                image.style.backgroundImage = new StyleBackground(glyph);
                image.style.width = glyph.rect.width;
                image.style.height = glyph.rect.height;
                _glyphs.Add(image);
            }
        }
    }
}
