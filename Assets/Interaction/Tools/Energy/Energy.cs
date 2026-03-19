using MoreMountains.Tools;
using UnityEngine;

namespace Interaction.Tools.Energy
{
    public class Energy : MonoBehaviour
    {
        [field: SerializeField] public int StartEnergy { get; private set; }
        [field: SerializeField] public int MaxEnergy { get; private set; }

        private MMProgressBar _energyProgressBar;
        
        public MMProgressBar GetProgressBar()
        {
            // TODO: Right now, there's just one bar in the scene. If there are multiple, this needs to be handled differently.
            if (_energyProgressBar == null)
            {
                _energyProgressBar = FindFirstObjectByType<MMProgressBar>();
            }
            return _energyProgressBar;
        }

        public int CurrentEnergy { get; private set; }


        public void SetMaxEnergy(int maxEnergy)
        {
            MaxEnergy = maxEnergy;
        }

        public void ConsumeEnergy(int amount)
        {
            CurrentEnergy = Mathf.Max(CurrentEnergy - amount, 0);
            GetProgressBar().UpdateBar(CurrentEnergy, 0, MaxEnergy);
            if (CurrentEnergy <= 0)
            {
                EnergyDepletedEvent.Trigger();
            }
        }

        public void RestoreEnergy(int amount)
        {
            CurrentEnergy = Mathf.Min(CurrentEnergy + amount, MaxEnergy);
            GetProgressBar().UpdateBar(CurrentEnergy, 0, MaxEnergy);
        }

        public void Initialize(int startEnergy)
        {
            StartEnergy = startEnergy;
            CurrentEnergy = StartEnergy;
            GetProgressBar().UpdateBar(CurrentEnergy, 0, MaxEnergy);
        }
    }
}