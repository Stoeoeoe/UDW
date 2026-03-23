using System;
using EditorUI.Attributes;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace EditorUI.Editor
{
    [CustomPropertyDrawer(typeof(DialAttribute))]
    public class DirectionDial : PropertyDrawer
    {
        // Threshold and helpers to treat very small floating-point noise as exact zero
        private const float ZeroThreshold = 1e-6f;
        private static float CleanFloat(float v) => Mathf.Abs(v) < ZeroThreshold ? 0f : v;
        private static Vector2 CleanVector(Vector2 v) => v.sqrMagnitude < (ZeroThreshold * ZeroThreshold) ? Vector2.zero : new Vector2(CleanFloat(v.x), CleanFloat(v.y));

        public override VisualElement CreatePropertyGUI(SerializedProperty property)
        {
            if (property.propertyType != SerializedPropertyType.Vector2)
            {
                var error = new HelpBox($"[Dial] requires a Vector2 field, got {property.propertyType}.", HelpBoxMessageType.Error);
                return error;
            }

            var attr = (DialAttribute)attribute;

            var root = new VisualElement();
            root.style.flexDirection = FlexDirection.Row;
            root.style.alignItems = Align.Center;
            root.style.paddingTop = 2;
            root.style.paddingBottom = 2;

            // Property label
            var label = new Label(property.displayName);
            label.style.minWidth = 120;
            label.style.unityTextAlign = TextAnchor.MiddleLeft;
            root.Add(label);

            // Dial
            var dial = new DialElement(attr.SnapAngle);
            dial.style.width = 52;
            dial.style.height = 52;
            dial.style.marginRight = 6;
            dial.style.flexShrink = 0;
            // Ensure dial receives a cleaned vector (tiny noise -> exact zero)
            dial.SetDirection(CleanVector(property.vector2Value));
            root.Add(dial);

            // X / Y float fields stacked vertically
            var fields = new VisualElement();
            fields.style.flexDirection = FlexDirection.Column;
            fields.style.justifyContent = Justify.Center;
            fields.style.flexGrow = 1;

            var xField = new FloatField("X") { value = CleanFloat(property.vector2Value.x) };
            xField.style.marginBottom = 2;
            var yField = new FloatField("Y") { value = CleanFloat(property.vector2Value.y) };

            StyleFloatField(xField);
            StyleFloatField(yField);

            fields.Add(xField);
            fields.Add(yField);
            root.Add(fields);

            // ── Sync: dial → fields ──────────────────────────────────────────
            dial.OnDirectionChanged += dir =>
            {
                var cleaned = CleanVector(dir);
                property.vector2Value = cleaned;
                property.serializedObject.ApplyModifiedProperties();
                xField.SetValueWithoutNotify(CleanFloat(cleaned.x));
                yField.SetValueWithoutNotify(CleanFloat(cleaned.y));
            };

            // ── Sync: fields → dial ──────────────────────────────────────────
            xField.RegisterValueChangedCallback(evt =>
            {
                var v = property.vector2Value;
                v.x = CleanFloat(evt.newValue);
                property.vector2Value = v;
                property.serializedObject.ApplyModifiedProperties();
                dial.SetDirection(CleanVector(v));
            });

            yField.RegisterValueChangedCallback(evt =>
            {
                var v = property.vector2Value;
                v.y = CleanFloat(evt.newValue);
                property.vector2Value = v;
                property.serializedObject.ApplyModifiedProperties();
                dial.SetDirection(CleanVector(v));
            });

            return root;
        }

        private static void StyleFloatField(FloatField f)
        {
            f.labelElement.style.minWidth = 12;
            f.labelElement.style.width = 12;
        }

        // ════════════════════════════════════════════════════════════════════
        // Inner VisualElement — the circular dial
        // ════════════════════════════════════════════════════════════════════
        private sealed class DialElement : VisualElement
        {
            public event Action<Vector2> OnDirectionChanged;

            private readonly float _snapAngle;
            private Vector2 _direction = Vector2.right;

            // Colors
            private static readonly Color BgColor       = new(0.17f, 0.17f, 0.17f, 1f);
            private static readonly Color RimColor       = new(0.40f, 0.40f, 0.40f, 1f);
            private static readonly Color NeedleColor    = new(0.90f, 0.60f, 0.10f, 1f);
            private static readonly Color CrosshairColor = new(0.35f, 0.35f, 0.35f, 0.6f);

            public DialElement(float snapAngle)
            {
                _snapAngle = snapAngle;

                generateVisualContent += Draw;
                focusable = true;

                RegisterCallback<PointerDownEvent>(OnPointerDown);
                RegisterCallback<PointerMoveEvent>(OnPointerMove);
                RegisterCallback<PointerUpEvent>(OnPointerUp);

                // Hover highlight
                RegisterCallback<MouseEnterEvent>(_ => MarkDirtyRepaint());
                RegisterCallback<MouseLeaveEvent>(_ => MarkDirtyRepaint());
            }

            public void SetDirection(Vector2 dir)
            {
                // Treat near-zero vectors as exact zero so the UI shows 0 instead of tiny noise
                if (dir.sqrMagnitude < (ZeroThreshold * ZeroThreshold))
                {
                    _direction = Vector2.zero;
                    MarkDirtyRepaint();
                    return;
                }
                _direction = dir.normalized;
                MarkDirtyRepaint();
            }

            // ── Pointer handling ─────────────────────────────────────────────

            private void OnPointerDown(PointerDownEvent e)
            {
                this.CapturePointer(e.pointerId);
                UpdateFromPointer(e.localPosition);
                e.StopPropagation();
            }

            private void OnPointerMove(PointerMoveEvent e)
            {
                if (!this.HasPointerCapture(e.pointerId)) return;
                UpdateFromPointer(e.localPosition);
                e.StopPropagation();
            }

            private void OnPointerUp(PointerUpEvent e)
            {
                if (!this.HasPointerCapture(e.pointerId)) return;
                this.ReleasePointer(e.pointerId);
                e.StopPropagation();
            }

            private void UpdateFromPointer(Vector2 localPos)
            {
                var center = new Vector2(contentRect.width * 0.5f, contentRect.height * 0.5f);
                var delta = localPos - center;
                if (delta.magnitude < 1f) return;

                // UIElements Y is down-positive; Vector2 Y is up-positive → negate Y
                float angleDeg = Mathf.Atan2(-delta.y, delta.x) * Mathf.Rad2Deg;

                if (_snapAngle > 0f)
                    angleDeg = Mathf.Round(angleDeg / _snapAngle) * _snapAngle;

                float rad = angleDeg * Mathf.Deg2Rad;
                _direction = new Vector2(Mathf.Cos(rad), Mathf.Sin(rad));


                MarkDirtyRepaint();
                OnDirectionChanged?.Invoke(_direction);
            }

            // ── Drawing ──────────────────────────────────────────────────────

            private void Draw(MeshGenerationContext ctx)
            {
                var p = ctx.painter2D;
                float w = contentRect.width;
                float h = contentRect.height;
                var center = new Vector2(w * 0.5f, h * 0.5f);
                float radius = Mathf.Min(w, h) * 0.5f - 1.5f;

                // Background circle
                p.fillColor = BgColor;
                p.strokeColor = RimColor;
                p.lineWidth = 1.5f;
                p.BeginPath();
                p.Arc(center, radius, 0f, 360f);
                p.Fill();
                p.Stroke();

                // Subtle crosshair guides
                DrawCrosshair(p, center, radius);

                // Needle — direction line
                // Vector2 Y is up, screen Y is down → negate Y
                var screenDir = new Vector2(_direction.x, -_direction.y).normalized;
                var tip = center + screenDir * (radius - 5f);

                p.strokeColor = NeedleColor;
                p.lineWidth = 2f;
                p.BeginPath();
                p.MoveTo(center);
                p.LineTo(tip);
                p.Stroke();

                // Tip dot
                p.fillColor = NeedleColor;
                p.BeginPath();
                p.Arc(tip, 3.5f, 0f, 360f);
                p.Fill();

                // Center pivot dot
                p.fillColor = RimColor;
                p.BeginPath();
                p.Arc(center, 2.5f, 0f, 360f);
                p.Fill();
            }

            private static void DrawCrosshair(Painter2D p, Vector2 center, float radius)
            {
                float arm = radius * 0.85f;
                p.strokeColor = CrosshairColor;
                p.lineWidth = 0.75f;

                // Horizontal
                p.BeginPath();
                p.MoveTo(new Vector2(center.x - arm, center.y));
                p.LineTo(new Vector2(center.x + arm, center.y));
                p.Stroke();

                // Vertical
                p.BeginPath();
                p.MoveTo(new Vector2(center.x, center.y - arm));
                p.LineTo(new Vector2(center.x, center.y + arm));
                p.Stroke();
            }
        }
    }
}
