using MoreMountains.Tools;
using Core.Catalogs;
using Interaction.Dialog;

public class DataManager : MMSingleton<DataManager>
{
    // Expose the shared catalog directly; no definition copies or Start-time Resources scan.
    public TypewriterSoundCatalog TypewriterSounds =>
        CatalogResources.Load<TypewriterSoundCatalog>(TypewriterSoundCatalog.ResourceName);

}
