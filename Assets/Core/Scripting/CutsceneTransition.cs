using System;
using UnityEngine;

namespace Core.Scripting
{
    [Serializable]
    public sealed class CutsceneTransition
    {
        [SerializeField] private bool enabled = true;
        public bool Enabled => enabled;

        public CutsceneTransition(bool enabled = true)
        {
            this.enabled = enabled;
        }
    }
}
