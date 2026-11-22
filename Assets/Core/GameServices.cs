using System;
using Character;
using Core.Catalogs;
using Core.Context;
using Core.Dialogue.Vulcanus;
using Core.Divinity;
using Core.Game;
using Core.Items;
using Core.Location;
using Core.Quests;
using Core.SocialStanding;
using Core.Scripting;
using Core.Shops;
using Core.Routines;
using Core.Spawning;
using Core.Tile.Vulcanus;
using Core.TimeAndWeather;
using Interaction.Dialog;
using Plants;
using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace Core
{
    /// <summary>Game-session services. Construction and disposal belong to the container, not scene callbacks.</summary>
    public static class GameServices
    {
        public static void Register(IContainerBuilder builder, PlayerSettings player, ItemSettings items, ClockSettings clock,
            RoutineSettings routines, QuestSettings quests)
        {
            if (!builder.Exists(typeof(PlayerSettings))) builder.RegisterInstance(player);
            if (!builder.Exists(typeof(ItemSettings))) builder.RegisterInstance(items);
            if (!builder.Exists(typeof(ClockSettings))) builder.RegisterInstance(clock);
            if (!builder.Exists(typeof(RoutineSettings))) builder.RegisterInstance(routines);
            if (!builder.Exists(typeof(QuestSettings)))
            {
                quests.Validate();
                builder.RegisterInstance(quests);
            }
            builder.Register<GameState>(Lifetime.Singleton);
            builder.Register<LocationContext>(Lifetime.Singleton);
            builder.Register<CharacterManager>(Lifetime.Singleton);
            builder.Register<PlayerStateManager>(Lifetime.Singleton);
            // Frame callbacks are declared as interfaces; the scope's entry-point dispatcher drives them.
            builder.Register<GameClock>(Lifetime.Singleton).AsSelf().As<IStartable>().As<ITickable>();
            builder.Register<SeasonalTiles>(Lifetime.Singleton).As<IStartable>();
            builder.Register<PlayerInteractionContext>(Lifetime.Singleton).AsSelf().As<ILateTickable>();
            builder.Register<ItemManager>(Lifetime.Singleton);
            builder.Register<PlantManager>(Lifetime.Singleton);
            builder.Register<WorldObjectSpawner>(Lifetime.Singleton);
            builder.Register<RoutineNpcService>(Lifetime.Singleton).AsSelf().As<ITickable>();
            builder.Register<ShopService>(Lifetime.Singleton);
            builder.Register<QuestService>(Lifetime.Singleton).AsSelf().As<ITickable>();
            builder.Register<SocialStandingService>(Lifetime.Singleton);
            builder.Register<GameStateManager>(Lifetime.Singleton);
            builder.Register<GameSaveService>(Lifetime.Singleton);
#if UNITY_EDITOR || DEBUG
            builder.Register<DevQuickSave>(Lifetime.Singleton).As<ITickable>();
#endif
            builder.Register<LuaRuntime>(Lifetime.Singleton);
            builder.Register<TypewriterSoundResolver>(Lifetime.Singleton);
            builder.Register<VulcanusDialogueRunner>(Lifetime.Singleton);
            builder.Register<DivineFavour>(Lifetime.Singleton);
            builder.Register<SkillDefinitions>(Lifetime.Singleton);
            builder.Register<DeityDefinitions>(Lifetime.Singleton);

            if (!builder.Exists(typeof(DefinitionCatalog)))
            {
                var catalog = Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName);
                if (!catalog) throw new InvalidOperationException("The required DefinitionCatalog is missing.");
                builder.RegisterInstance(catalog);
            }
        }
    }
}
