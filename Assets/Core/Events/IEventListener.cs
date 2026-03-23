namespace Core.Events
{
    public interface IEventListener<T>
    {
        void OnEvent(T e);
    }
}
