using UnityEngine;

namespace Core.Tile.Vulcanus
{
    /// <summary>Shows an object's sprite for the <see cref="TileSeason"/>, or its base sprite where the season has none.</summary>
    [RequireComponent(typeof(SpriteRenderer))]
    public sealed class SeasonalSprite : MonoBehaviour
    {
        [SerializeField] private SpriteRenderer target;
        [SerializeField] private Sprite baseSprite;
        [SerializeField] private Sprite[] seasonSprites; // by Season; null keeps the base sprite

        public void Configure(SpriteRenderer renderer, Sprite[] sprites)
        {
            target = renderer;
            baseSprite = renderer.sprite;
            seasonSprites = sprites;
        }

        private void OnEnable()
        {
            TileSeason.Changed += Apply;
            Apply();
        }

        private void OnDisable() => TileSeason.Changed -= Apply;

        private void Apply()
        {
            var season = TileSeason.Current;
            target.sprite = season is { } current && seasonSprites[(int)current] ? seasonSprites[(int)current] : baseSprite;
        }
    }
}
