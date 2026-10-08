using Core.Events;
using UnityEngine;

namespace Plants
{
    public class FarmablePlant : MonoBehaviour, IEventListener<PlantGrowthEvent>, IEventListener<PlantConditionChangedEvent>
    {
        private string _locationId;
        private Vector2Int _position;
        private PlantData _plantData;
        private GameObject _visualInstance;
        private PlantCondition _condition;
        private int _stageIndex;

        public void Initialize(string locationId, Vector2Int position, PlantData plantData, int stageIndex,
            PlantCondition condition = PlantCondition.Healthy)
        {
            _locationId = locationId;
            _position   = position;
            _plantData  = plantData;
            _condition = condition;
            SetVisual(stageIndex);
        }

        private void OnEnable()
        {
            this.Subscribe<PlantGrowthEvent>();
            this.Subscribe<PlantConditionChangedEvent>();
        }

        private void OnDisable()
        {
            this.Unsubscribe<PlantGrowthEvent>();
            this.Unsubscribe<PlantConditionChangedEvent>();
        }

        public void OnEvent(PlantGrowthEvent e)
        {
            if (_condition != PlantCondition.Healthy || e.LocationId != _locationId || e.Position != _position) return;
            SetVisual(e.NewStageIndex);
        }

        public void OnEvent(PlantConditionChangedEvent e)
        {
            if (_condition == e.Condition || e.LocationId != _locationId || e.Position != _position) return;
            _condition = e.Condition;
            if (_condition == PlantCondition.Wilted && _plantData.WiltedRepresentation == null) TintWiltedVisual();
            else SetVisual(_stageIndex);
        }

        private void SetVisual(int stageIndex)
        {
            if (_visualInstance) Destroy(_visualInstance);
            _visualInstance = null;
            _stageIndex = stageIndex;
            var representation = _condition == PlantCondition.Wilted ? _plantData.WiltedRepresentation : null;
            if (representation == null)
            {
                if (stageIndex < 0 || stageIndex >= _plantData.GrowthStages.Count) return;
                representation = _plantData.GrowthStages[stageIndex]?.Representation;
            }
            if (representation == null) return;
            _visualInstance = representation.CreateInstance(transform);
            _visualInstance.transform.localPosition = Vector3.zero;
            if (_condition == PlantCondition.Wilted && _plantData.WiltedRepresentation == null) TintWiltedVisual();
        }

        private void TintWiltedVisual()
        {
            if (!_visualInstance) return;
            foreach (var renderer in _visualInstance.GetComponentsInChildren<SpriteRenderer>(true))
                renderer.color = new Color(0.55f, 0.45f, 0.3f, renderer.color.a);
        }
    }
}
