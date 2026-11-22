namespace Interaction
{
    /// <summary>
    /// What the Interact button does to a target, as the prompt shows it. The key is stable, like dialogue and quest
    /// message keys; the text is the English source.
    /// </summary>
    // TODO(STO-110): show the translated text for the key once game UI text has translations.
    public sealed record InteractionVerb(string Key, string Text)
    {
        public static readonly InteractionVerb Use = new("interaction.verb.use", "Use");
        public static readonly InteractionVerb Talk = new("interaction.verb.talk", "Talk");
        public static readonly InteractionVerb Open = new("interaction.verb.open", "Open");
        public static readonly InteractionVerb PickUp = new("interaction.verb.pick_up", "Pick up");
        public static readonly InteractionVerb Harvest = new("interaction.verb.harvest", "Harvest");
        public static readonly InteractionVerb Clear = new("interaction.verb.clear", "Clear");
        public static readonly InteractionVerb Sit = new("interaction.verb.sit", "Sit");
        public static readonly InteractionVerb Sleep = new("interaction.verb.sleep", "Sleep");
        public static readonly InteractionVerb Shop = new("interaction.verb.shop", "Shop");
        public static readonly InteractionVerb Enter = new("interaction.verb.enter", "Enter");
        public static readonly InteractionVerb Pray = new("interaction.verb.pray", "Pray");
    }
}
