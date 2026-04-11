using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace Environment
{
    [RequireComponent(typeof(Light2D))]
    public class Torch : MonoBehaviour
    {
        private Light2D _light;
    
        [field:SerializeField] public Color LightColor { get; set; } = Color.white;
        [field:SerializeField] public float Intensity { get; set; } = 10f;
        [field:SerializeField] public float InnerRadius { get; set; } = 0.5f;
        [field: SerializeField] public float OuterRadius { get; set; } = 10f;
        [field: SerializeField] public float Falloff { get; set; } = 1f;
        
    
        private void Awake()
        {
            _light = GetComponent<Light2D>();
        }

        void OnValidate()
        {
            _light = GetComponent<Light2D>();
            _light.color = LightColor;
            _light.intensity = Intensity;
            _light.pointLightInnerRadius = InnerRadius;
            _light.pointLightOuterRadius = OuterRadius;
            _light.falloffIntensity = Falloff;
            
        }
    }
}
