using System;
using Core.Dialogue.Vulcanus;
using Core.Divinity;
using Core.Items;
using Core.Location;
using Core.Routines;
using Core.Spawning;
using Core.TimeAndWeather;
using Plants;
using UI.Containers;
using UnityEngine;
using VContainer;
using VContainer.Unity;
#if UNITY_EDITOR
using Core.Game;
using EditorSessionState = UnityEditor.SessionState;
#endif

namespace Core
{
    /// <summary>VContainer's project root: authored settings and Unity presentation components.</summary>
    [DefaultExecutionOrder(-2000)]
    public class SystemRoot : LifetimeScope
    {
        public const string PrefabPath = "Assets/Resources/SystemRoot.prefab";
#if UNITY_EDITOR
        /// <summary>Editor only: a slot to load before the first location. Set by Play Mode tests and start-mode buttons.</summary>
        public const string EditorStartSlotKey = "UrdewValley.StartSlot";

        /// <summary>Editor only: starts a new game with this save name before the first location. Used once.</summary>
        public const string EditorNewGameKey = "UrdewValley.NewGame";
#endif

        [SerializeField] private PlayerSettings player = new();
        [SerializeField] private ItemSettings items = new();
        [SerializeField] private ClockSettings clock = new();
        [SerializeField] private RoutineSettings routines = new();
        [SerializeField] private Core.Quests.QuestSettings quests = new();
        public ItemSettings Items => items;
        public ClockSettings Clock => clock;

        /// <summary>Registers the game-session services with the authored settings; scene-less tests use this alone.</summary>
        public void RegisterServices(IContainerBuilder builder) =>
            GameServices.Register(builder, player, items, clock, routines, quests);

        protected override void Configure(IContainerBuilder builder) => ConfigureServices(builder, gameObject);

        public static void ConfigureServices(IContainerBuilder builder, GameObject root)
        {
            var configuration = root.GetComponent<SystemRoot>();
            configuration.RegisterServices(builder);
            // The dialogue screen is a presentation component behind the runner's IDialoguePresenter.
            if (!builder.Exists(typeof(IDialoguePresenter), true))
            {
                var presenters = root.GetComponentsInChildren<IDialoguePresenter>(true);
                if (presenters.Length != 1)
                    throw new InvalidOperationException("SystemRoot requires exactly one dialogue presenter.");
                builder.RegisterInstance<IDialoguePresenter>(presenters[0]);
            }
            var screens = root.GetComponentsInChildren<ContainerScreen>(true);
            if (screens.Length != 1)
                throw new InvalidOperationException("SystemRoot requires exactly one container screen.");
            builder.RegisterInstance(screens[0]);
            // Keep authored component instances and their Inspector configuration. A registration supplied
            // by the composing caller, such as a test double, takes precedence.
            foreach (var manager in root.GetComponentsInChildren<GameManager>(true))
                if (!builder.Exists(manager.GetType())) builder.RegisterInstance(manager, manager.GetType());
            builder.RegisterBuildCallback(container =>
            {
                container.InjectGameObject(root);
                // Quests that start with the game wait for its start event, which the new game below raises.
                container.Resolve<Core.Quests.QuestService>();
#if UNITY_EDITOR
                // A requested slot is loaded once, before any location is entered.
                var startSlot = EditorSessionState.GetString(EditorStartSlotKey, "");
                if (startSlot != "")
                {
                    EditorSessionState.EraseString(EditorStartSlotKey);
                    if (!container.Resolve<GameStateManager>().Load(startSlot))
                        throw new InvalidOperationException($"The requested start slot '{startSlot}' does not exist.");
                }
                var newGame = EditorSessionState.GetString(EditorNewGameKey, "");
                if (newGame != "")
                {
                    EditorSessionState.EraseString(EditorNewGameKey);
                    container.Resolve<GameStateManager>().NewGame(newGame);
                }
#endif
                // These session subscriptions must exist before the first overnight transition.
                container.Resolve<PlantManager>();
                container.Resolve<DivineFavour>();
                container.Resolve<PlayerStateManager>();
                var level = container.Resolve<LevelManager>();
                // Persistent entities are restored first, before the managers' own location callbacks.
                level.RegisterLifecycle(container.Resolve<WorldObjectSpawner>());
                // Routine characters are placed after persistent entities exist; they are never saved.
                level.RegisterLifecycle(container.Resolve<RoutineNpcService>());
                level.RegisterLifecycle(container.Resolve<Core.Quests.QuestService>());
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
