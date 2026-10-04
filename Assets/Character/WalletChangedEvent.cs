namespace Character
{
    /// <summary>Raised after the live balance changes; listeners can safely read the updated wallet.</summary>
    public struct WalletChangedEvent
    {
        public GameCharacter Character;
        public Wallet Wallet;
        public int Previous;
        public int Current;
    }
}
