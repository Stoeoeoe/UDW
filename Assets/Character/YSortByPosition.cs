using UnityEngine;
using UnityEngine.Rendering;

namespace Character
{
    [RequireComponent(typeof(SortingGroup))]
    public class YSortByPosition : MonoBehaviour
    {
        [SerializeField] private int offset = 0;
        [SerializeField] private float precision = 100f;

        private SortingGroup _sortingGroup;

        public int Offset
        {
            get => offset;
            set => offset = value;
        }

        private void Awake()
        {
            _sortingGroup = GetComponent<SortingGroup>();
        }

        private void LateUpdate()
        {
            _sortingGroup.sortingOrder = Mathf.RoundToInt(-transform.position.y * precision) + offset;
        }
    }
}