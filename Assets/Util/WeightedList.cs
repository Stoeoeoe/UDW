using System;
using System.Collections.Generic;
using System.Linq;
using Sirenix.OdinInspector;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Util
{
    [Serializable]
    public class WeightedList<T>
    {
        [Serializable]
        public class WeightedItem
        {
            [HorizontalGroup("Item", Width = 0.6f)]
            [HideLabel]
            public T item;
        
            [HorizontalGroup("Item", Width = 0.2f)]
            [LabelText("Weight")]
            [MinValue(0)]
            public float weight = 1f;
        
            [HorizontalGroup("Item", Width = 0.2f)]
            [LabelText("Chance")]
            [ReadOnly]
            [ShowInInspector]
            [ProgressBar(0, 100, ColorGetter = nameof(GetChanceColor))]
            public float Chance { get; set; }
        
            private Color GetChanceColor()
            {
                if (Chance < 10f) return new Color(0.8f, 0.3f, 0.3f);
                if (Chance < 30f) return new Color(0.9f, 0.6f, 0.3f);
                if (Chance < 60f) return new Color(0.9f, 0.9f, 0.3f);
                return new Color(0.3f, 0.8f, 0.3f);
            }
        }
    
        [ListDrawerSettings(
            ShowIndexLabels = true,
            ListElementLabelName = "item",
            DraggableItems = true,
            ShowPaging = false,
            CustomAddFunction = nameof(AddNewItem)
        )]
        [OnValueChanged(nameof(RecalculateChances))]
        [SerializeField]
        private List<WeightedItem> items = new List<WeightedItem>();
    
        [ShowInInspector]
        [FoldoutGroup("Statistics")]
        [ReadOnly]
        [LabelText("Total Weight")]
        public float TotalWeight { get; private set; }
    
        [ShowInInspector]
        [FoldoutGroup("Statistics")]
        [ReadOnly]
        [LabelText("Item Count")]
        public int Count => items?.Count ?? 0;
    
        public WeightedList()
        {
            items = new List<WeightedItem>();
        }
    
        private WeightedItem AddNewItem()
        {
            return new WeightedItem { weight = 1f };
        }
    
        [Button("Recalculate Chances", ButtonSizes.Medium)]
        [GUIColor(0.4f, 0.8f, 1f)]
        [FoldoutGroup("Statistics")]
        private void RecalculateChances()
        {
            if (items == null || items.Count == 0)
            {
                TotalWeight = 0f;
                return;
            }
        
            TotalWeight = items.Sum(i => Mathf.Max(0f, i.weight));
        
            if (TotalWeight > 0f)
            {
                foreach (var item in items)
                {
                    item.Chance = (Mathf.Max(0f, item.weight) / TotalWeight) * 100f;
                }
            }
            else
            {
                foreach (var item in items)
                {
                    item.Chance = 0f;
                }
            }
        }
    
        /// <summary>
        /// Adds an item with a specified weight
        /// </summary>
        public void Add(T item, float weight = 1f)
        {
            items.Add(new WeightedItem { item = item, weight = weight });
            RecalculateChances();
        }
    
        /// <summary>
        /// Removes an item from the list
        /// </summary>
        public bool Remove(T item)
        {
            var toRemove = items.FirstOrDefault(i => EqualityComparer<T>.Default.Equals(i.item, item));
            if (toRemove != null)
            {
                items.Remove(toRemove);
                RecalculateChances();
                return true;
            }
            return false;
        }
    
        /// <summary>
        /// Clears all items
        /// </summary>
        public void Clear()
        {
            items.Clear();
            RecalculateChances();
        }
    
        /// <summary>
        /// Gets a random item based on weights
        /// </summary>
        public T GetRandomItem()
        {
            if (items == null || items.Count == 0)
            {
                Debug.LogWarning("WeightedList is empty!");
                return default(T);
            }
        
            RecalculateChances();
        
            if (TotalWeight <= 0f)
            {
                Debug.LogWarning("Total weight is 0 or negative!");
                return items[0].item;
            }
        
            float randomValue = Random.Range(0f, TotalWeight);
            float cumulative = 0f;
        
            foreach (var item in items)
            {
                cumulative += Mathf.Max(0f, item.weight);
                if (randomValue <= cumulative)
                {
                    return item.item;
                }
            }
        
            return items[items.Count - 1].item;
        }
    
        /// <summary>
        /// Gets multiple random items without replacement
        /// </summary>
        public List<T> GetRandomItems(int count)
        {
            if (count > items.Count)
            {
                Debug.LogWarning($"Requested {count} items but only {items.Count} available!");
                count = items.Count;
            }
        
            var result = new List<T>();
            var tempList = new List<WeightedItem>(items);
        
            for (int i = 0; i < count; i++)
            {
                if (tempList.Count == 0) break;
            
                float totalWeight = tempList.Sum(item => Mathf.Max(0f, item.weight));
                float randomValue = Random.Range(0f, totalWeight);
                float cumulative = 0f;
            
                for (int j = 0; j < tempList.Count; j++)
                {
                    cumulative += Mathf.Max(0f, tempList[j].weight);
                    if (randomValue <= cumulative)
                    {
                        result.Add(tempList[j].item);
                        tempList.RemoveAt(j);
                        break;
                    }
                }
            }
        
            return result;
        }
    
        /// <summary>
        /// Gets all items as a list
        /// </summary>
        public List<T> GetAllItems()
        {
            return items.Select(i => i.item).ToList();
        }
    
        [Button("Normalize Weights", ButtonSizes.Medium)]
        [GUIColor(0.3f, 0.9f, 0.3f)]
        [FoldoutGroup("Statistics")]
        private void NormalizeWeights()
        {
            if (items == null || items.Count == 0 || TotalWeight <= 0f)
                return;
        
            foreach (var item in items)
            {
                item.weight = (item.weight / TotalWeight) * 100f;
            }
        
            RecalculateChances();
        }
    
        [Button("Reset All Weights to 1", ButtonSizes.Medium)]
        [GUIColor(0.9f, 0.5f, 0.3f)]
        [FoldoutGroup("Statistics")]
        private void ResetWeights()
        {
            if (items == null) return;
        
            foreach (var item in items)
            {
                item.weight = 1f;
            }
        
            RecalculateChances();
        }
    }
}