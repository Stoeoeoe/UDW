using System;
using Core.Events;
using Interaction;
using UnityEngine;

namespace Plants
{
    /// <summary>Scene view of a saved crop; updates its visuals and picking target as crop state changes.</summary>
    public class FarmablePlant : MonoBehaviour, IEventListener<PlantGrowthEvent>, IEventListener<PlantConditionChangedEvent>,
        IEventListener<PlantHarvestedEvent>, IEventListener<PlantRemovedEvent>
    {
        private string _locationId;
        private Vector2Int _position;
        private PlantData _plantData;
        private GameObject _visualInstance;
        private PlantCondition _condition;
        private int _stageIndex;
        private PlantState _state;
        private PlantHarvestInteractable _picking;

        /// <summary>Binds the scene view to an existing saved crop before enabling it.</summary>
        public void Bind(string locationId, Vector2Int position, PlantData plantData, PlantState state)
        {
            if (PlantManager.Instance.GetPlantState(locationId, position) != state)
                throw new InvalidOperationException("The crop must be stored at its bound location before binding its view.");
            _locationId = locationId;
            _position   = position;
            _plantData  = plantData;
            _state = state;
            _condition = state.condition;
            if (!_picking)
            {
                var interactionCollider = gameObject.AddComponent<BoxCollider2D>();
                interactionCollider.isTrigger = true;
                interactionCollider.size = new Vector2(0.8f, 0.8f);
                var layer = LayerMask.NameToLayer("Interactable");
                if (layer < 0) throw new InvalidOperationException("Crop interaction requires the Interactable layer.");
                gameObject.layer = layer;
                _picking = gameObject.AddComponent<PlantHarvestInteractable>();
            }
            _picking.Bind(locationId, position, plantData, state);
            SetVisual(plantData.GetGrowthStageIndexByDays(state.daysPassedSincePlanting));
        }

        private void OnEnable()
        {
            this.Subscribe<PlantGrowthEvent>();
            this.Subscribe<PlantConditionChangedEvent>();
            this.Subscribe<PlantHarvestedEvent>();
            this.Subscribe<PlantRemovedEvent>();
        }

        private void OnDisable()
        {
            this.Unsubscribe<PlantGrowthEvent>();
            this.Unsubscribe<PlantConditionChangedEvent>();
            this.Unsubscribe<PlantHarvestedEvent>();
            this.Unsubscribe<PlantRemovedEvent>();
        }

        public void OnEvent(PlantGrowthEvent e)
        {
            if (_condition != PlantCondition.Healthy || e.LocationId != _locationId || e.Position != _position) return;
            // A daily callback may already have harvested/regrown or replaced the saved plant.
            if (PlantManager.Instance.GetPlantState(_locationId, _position) != _state) return;
            var stage = _plantData.GetGrowthStageIndexByDays(_state.daysPassedSincePlanting);
            if (stage != _stageIndex) SetVisual(stage);
        }

        public void OnEvent(PlantConditionChangedEvent e)
        {
            if (_condition == e.Condition || e.LocationId != _locationId || e.Position != _position) return;
            if (PlantManager.Instance.GetPlantState(_locationId, _position) != _state) return;
            _condition = e.Condition;
            if (_condition == PlantCondition.Wilted && _plantData.WiltedRepresentation == null) TintWiltedVisual();
            else SetVisual(_stageIndex);
            NotifyInteraction();
        }

        public void OnEvent(PlantHarvestedEvent e)
        {
            if (e.LocationId != _locationId || e.Position != _position || !ReferenceEquals(e.State, _state)) return;
            if (e.Removed)
            {
                RemoveView();
            }
            else SetVisual(e.NewStageIndex);
        }

        public void OnEvent(PlantRemovedEvent e)
        {
            if (e.LocationId != _locationId || e.Position != _position || !ReferenceEquals(e.State, _state)) return;
            RemoveView();
        }

        private void RemoveView()
        {
            gameObject.SetActive(false);
            NotifyInteraction();
            if (Application.isPlaying) Destroy(gameObject);
            else DestroyImmediate(gameObject);
        }

        private void SetVisual(int stageIndex)
        {
            if (_visualInstance)
            {
                _visualInstance.SetActive(false);
                if (Application.isPlaying) Destroy(_visualInstance);
                else DestroyImmediate(_visualInstance);
            }
            _visualInstance = null;
            _stageIndex = stageIndex;
            var representation = _condition == PlantCondition.Wilted ? _plantData.WiltedRepresentation : null;
            if (representation == null)
            {
                representation = _plantData.GrowthStages[stageIndex].Representation;
            }
            var staging = new GameObject("Stage initialization");
            staging.SetActive(false);
            staging.transform.SetParent(transform, false);
            try
            {
                _visualInstance = representation.CreateInstance(staging.transform);
                _visualInstance.transform.localPosition = Vector3.zero;
                if (_condition == PlantCondition.Wilted && _plantData.WiltedRepresentation == null) TintWiltedVisual();
                _visualInstance.transform.SetParent(transform, false);
            }
            finally
            {
                if (Application.isPlaying) Destroy(staging);
                else DestroyImmediate(staging);
            }
            NotifyInteraction();
        }

        private void NotifyInteraction()
        {
            InteractableStateChangedEvent.Trigger(_picking, -1);
        }

        private void TintWiltedVisual()
        {
            foreach (var renderer in _visualInstance.GetComponentsInChildren<SpriteRenderer>(true))
                renderer.color = new Color(0.55f, 0.45f, 0.3f, renderer.color.a);
        }
    }
}
