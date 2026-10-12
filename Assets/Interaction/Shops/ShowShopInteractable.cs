using Character;
using Core.Shops;
using UI.Shops;
using UnityEngine;

namespace Interaction.Shops
{
    public sealed class ShowShopInteractable : AbstractInteractable
    {
        [SerializeField] private Shop shop;

        protected override void Interact(GameCharacter instigator)
        {
            if (!shop) shop = GetComponent<Shop>();
            if (!shop)
            {
                Debug.LogWarning($"[ShowShopInteractable] No Shop is assigned on '{gameObject.name}'.", this);
                return;
            }

            if (!ShopUIDocumentPresenter.Instance)
            {
                Debug.LogWarning("[ShowShopInteractable] No active ShopUIDocumentPresenter was found.", this);
                return;
            }

            ShopUIDocumentPresenter.Instance.Open(shop, instigator);
        }
    }
}
