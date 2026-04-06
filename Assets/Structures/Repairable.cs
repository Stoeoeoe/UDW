namespace Structures
{
    public interface IRepairable
    {
        public void Repair(int addedHealth);
        public void Damage(int removedHealth);
    }
}