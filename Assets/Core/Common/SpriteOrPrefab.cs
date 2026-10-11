using System;
using Sirenix.OdinInspector;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Common
{
    [Serializable]
    public class SpriteOrPrefab : INestedConfigurationValidator
    {
        [HorizontalGroup] public SpriteOrPrefabType type;
        public Sprite sprite;
        public GameObject prefab;

        public void CollectConfigurationErrors(Action<string, string> report)
        {
            if (!((type == SpriteOrPrefabType.Sprite && sprite) ||
                  (type == SpriteOrPrefabType.Prefab && prefab)))
                report("", "Assign a valid sprite or prefab representation.");
        }

        public GameObject CreateInstance(Transform parent = null)
        {
            GameObject go;
            if (type == SpriteOrPrefabType.Prefab)
            {
                go = Object.Instantiate(prefab, parent, false);
            }
            else
            {
                go = new GameObject("SpriteInstance");
                var spriteRenderer = go.AddComponent<SpriteRenderer>();
                spriteRenderer.sprite = sprite;
                go.transform.SetParent(parent, false);
            }

            return go;
        }

        public enum SpriteOrPrefabType
        {
            Sprite,
            Prefab
        }
    }
}
