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
        public const string PrefabPath = "Assets/Resources/SystemRoot.prefab";

        [SerializeField] private PlayerSettings player = new();
        [SerializeField] private Core.Items.ItemSettings items = new();
        [SerializeField] private Core.TimeAndWeather.ClockSettings clock = new();
        public PlayerSettings Player => player;
        public Core.Items.ItemSettings Items => items;
        public Core.TimeAndWeather.ClockSettings Clock => clock;

        protected override void Configure(IContainerBuilder builder) => ConfigureServices(builder, gameObject);

        public static void ConfigureServices(IContainerBuilder builder, GameObject root)
        {
            var configuration = root.GetComponent<SystemRoot>();
            GameServices.Register(builder, configuration.player, configuration.items, configuration.clock);
            // The dialogue screen is a presentation component behind the runner's IDialoguePresenter.
            if (!builder.Exists(typeof(Dialogue.Vulcanus.IDialoguePresenter), true))
            {
                var presenters = root.GetComponentsInChildren<Dialogue.Vulcanus.IDialoguePresenter>(true);
                if (presenters.Length != 1)
                    throw new System.InvalidOperationException("SystemRoot requires exactly one dialogue presenter.");
                builder.RegisterInstance<Dialogue.Vulcanus.IDialoguePresenter>(presenters[0]);
            }
            // Keep authored component instances and their Inspector configuration. A registration supplied
            // by the composing caller, such as a test double, takes precedence.
            foreach (var manager in root.GetComponentsInChildren<GameManager>(true))
                if (!builder.Exists(manager.GetType())) builder.RegisterInstance(manager, manager.GetType());
            builder.RegisterBuildCallback(container =>
            {
                container.InjectGameObject(root);
                // These session subscriptions must exist before the first overnight transition.
                container.Resolve<Plants.PlantManager>();
                container.Resolve<Core.Divinity.DivineFavour>();
                container.Resolve<PlayerStateManager>();
                var level = container.Resolve<LevelManager>();
                // Persistent entities are restored first, before the managers' own location callbacks.
                level.RegisterLifecycle(container.Resolve<Spawning.WorldObjectSpawner>());
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
