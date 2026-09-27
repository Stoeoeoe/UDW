using System;

namespace Core.Game
{
    [Serializable]
    public sealed class FarmlandState : WorldObjectState
    {
        public bool plowed;
        public bool irrigated;
    }
}
