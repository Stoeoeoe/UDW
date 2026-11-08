using Core.Shops;
using UI.Shops;
using VContainer;

namespace Core.Scripting
{
    [LuaModule("Shop")]
    public sealed class ShopLuaApi
    {
        [Inject] private CharacterManager _characters;
        [Inject] private ShopService _shops;

        /// <summary>Opens the shop screen of this shop for the player.</summary>
        [LuaCall(true)]
        [Preserve]
        public void Open(string shopId) =>
            ShopUIDocumentPresenter.Instance.Open(_shops.Require(shopId), _characters.MainCharacter);
    }
}
