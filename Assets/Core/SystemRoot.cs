using Core.Location;
using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace Core
{
    /// <summary>VContainer's project root: authored settings and Unity presentation components.</summary>
    [DefaultExecutionOrder(-2000)]
    public class SystemRoot : LifetimeScope
    {
        [SerializeField] private PlayerSettings player = new();
        [SerializeField] private Core.Items.ItemSettings items = new();
        public PlayerSettings Player => player;
        public Core.Items.ItemSettings Items => items;

        protected override void Configure(IContainerBuilder builder) => ConfigureServices(builder, gameObject);

        public static void ConfigureServices(IContainerBuilder builder, GameObject root)
        {
            var configuration = root.GetComponent<SystemRoot>();
            GameServices.Register(builder, configuration.player, configuration.items);
            // Keep authored component instances and their Inspector configuration.
            foreach (var manager in root.GetComponentsInChildren<GameManager>(true))
                builder.RegisterInstance(manager, manager.GetType());
            builder.RegisterBuildCallback(container =>
            {
                container.InjectGameObject(root);
                // These session subscriptions must exist before the first overnight transition.
                container.Resolve<Plants.PlantManager>();
                container.Resolve<Core.Divinity.DivineFavour>();
                container.Resolve<PlayerStateManager>();
                var level = container.Resolve<LevelManager>();
                foreach (var manager in root.GetComponentsInChildren<GameManager>(true))
                    if (manager is ILocationLifecycle lifecycle)
                    {
                        manager.Activated += () => level.RegisterLifecycle(lifecycle);
                        manager.Deactivated += () => level.UnregisterLifecycle(lifecycle);
                    }
            });
        }
    }
}
