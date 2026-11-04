namespace Interaction.Dialog
{
    public sealed class TypewriterSoundResolver
    {
        private readonly TypewriterSoundCatalog _catalog;
        public TypewriterSoundResolver(TypewriterSoundCatalog catalog) => _catalog = catalog;
        public TypewriterSound ResolveTypewriterSound(string speakerId, TypewriterSound defaultSound)
        {
            var sound = _catalog.Get(speakerId);
            return sound ? sound : defaultSound;
        }
    }
}
