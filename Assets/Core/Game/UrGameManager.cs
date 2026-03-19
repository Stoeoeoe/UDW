using MoreMountains.TopDownEngine;
using UnityEngine;

namespace Core.Game
{
    public class UrGameManager : GameManager
    {
        [SerializeField] protected int globalSeed;
        public int GlobalSeed => globalSeed;
    }
}