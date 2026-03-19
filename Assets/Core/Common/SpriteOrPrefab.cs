using System;
using Sirenix.OdinInspector;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Common
{
    [Serializable]
    public class SpriteOrPrefab
    {
        [HorizontalGroup] public SpriteOrPrefabType type;
        public Sprite sprite;
        public GameObject prefab;

        public GameObject CreateInstance(Transform parent = null)
        {
            GameObject go;
            if (type == SpriteOrPrefabType.Prefab && prefab != null)
            {
                go = Object.Instantiate(prefab);
            }
            else
            {
                go = new GameObject("SpriteInstance");
                var spriteRenderer = go.AddComponent<SpriteRenderer>();
                spriteRenderer.sprite = sprite;
            }

            go.transform.parent = parent;
            return go;
        }

        public enum SpriteOrPrefabType
        {
            Sprite,
            Prefab
        }
    }
}