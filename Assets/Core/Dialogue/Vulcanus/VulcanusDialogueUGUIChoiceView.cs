using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Core.Dialogue.Vulcanus
{
    public class VulcanusDialogueUGUIChoiceView : MonoBehaviour
    {
        [SerializeField] private Button button;
        [SerializeField] private TMP_Text label;

        public Button Button => button;
        public TMP_Text Label => label;

        private void Reset()
        {
            button = GetComponent<Button>();
            label = GetComponentInChildren<TMP_Text>(true);
        }

        public void Bind(string text, Action onSelected)
        {
            if (label != null)
                label.text = text ?? string.Empty;

            if (button == null)
                return;

            button.onClick.RemoveAllListeners();
            if (onSelected != null)
                button.onClick.AddListener(() => onSelected());
        }
    }
}
