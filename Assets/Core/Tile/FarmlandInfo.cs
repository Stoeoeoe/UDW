namespace Core.Tile
{
    public sealed class FarmlandInfo
    {
        public bool IsPlowed { get; private set; }
        public bool IsIrrigated { get; private set; }

        public void Plow()
        {
            IsPlowed = true;
        }

        public void Irrigate()
        {
            if (!IsPlowed)
                return;

            IsIrrigated = true;
        }

        public void DryOut()
        {
            IsIrrigated = false;
        }

        public void Unplow()
        {
            IsPlowed = false;
            IsIrrigated = false;
        }
    }
}