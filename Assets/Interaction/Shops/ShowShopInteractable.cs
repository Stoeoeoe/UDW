using Character;
using Core.Shops;
using UI.Shops;
using UnityEngine;
using VContainer;

namespace Interaction.Shops
{
    public sealed class ShowShopInteractable : AbstractInteractable
    {
        [SerializeField] private string shopId;
        [Inject] private ShopService _shops;

        protected override bool Interact(GameCharacter instigator)
        {
            if (!ShopUIDocumentPresenter.Instance)
            {
                Debug.LogWarning("[ShowShopInteractable] No active ShopUIDocumentPresenter was found.", this);
                return false;
            }

            ShopUIDocumentPresenter.Instance.Open(_shops.Require(shopId), instigator);
            return true;
        }
    }
}
