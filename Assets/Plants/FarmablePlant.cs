using Core.Events;
using UnityEngine;

namespace Plants
{
    public class FarmablePlant : MonoBehaviour, IEventListener<PlantGrowthEvent>
    {
        private string _locationId;
        private Vector2Int _position;
        private PlantData _plantData;
        private GameObject _visualInstance;

        public void Initialize(string locationId, Vector2Int position, PlantData plantData, int stageIndex)
        {
            _locationId = locationId;
            _position   = position;
            _plantData  = plantData;
            SetVisual(stageIndex);
        }

        private void OnEnable() => this.Subscribe();
        private void OnDisable() => this.Unsubscribe();

        public void OnEvent(PlantGrowthEvent e)
        {
            if (e.LocationId != _locationId || e.Position != _position) return;
            SetVisual(e.NewStageIndex);
        }

        private void SetVisual(int stageIndex)
        {
            if (_visualInstance) Destroy(_visualInstance);
            if (stageIndex >= _plantData.growthStages.Count) return;
            _visualInstance = _plantData.growthStages[stageIndex].representation.CreateInstance(transform);
            _visualInstance.transform.localPosition = Vector3.zero;
        }
    }
}
