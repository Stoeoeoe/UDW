using System;
using System.Linq;
using System.Reflection;
using Character;
using Core.Catalogs;
using Core.Divinity;
using Core.Game;
using Core.Items;
using Core.Location;
using Plants;
using UnityEngine;
using VContainer;

namespace Core
{
    /// <summary>Game-session services. Construction and disposal belong to the container, not scene callbacks.</summary>
    public static class GameServices
    {
        public static void Register(IContainerBuilder builder, PlayerSettings player, ItemSettings items)
        {
            if (!builder.Exists(typeof(PlayerSettings))) builder.RegisterInstance(player);
            if (!builder.Exists(typeof(ItemSettings))) builder.RegisterInstance(items);
            builder.Register<GameState>(Lifetime.Singleton);
            builder.Register<LocationContext>(Lifetime.Singleton);
            builder.Register<CharacterManager>(Lifetime.Singleton);
            builder.Register<PlayerStateManager>(Lifetime.Singleton);
            builder.Register<ItemManager>(Lifetime.Singleton);
            builder.Register<PlantManager>(Lifetime.Singleton);
            builder.Register<GameStateManager>(Lifetime.Singleton);
            builder.Register<GameSaveService>(Lifetime.Singleton);
            builder.Register<Scripting.LuaRuntime>(Lifetime.Singleton);
            builder.Register<Interaction.Dialog.TypewriterSoundResolver>(Lifetime.Singleton);
            builder.Register<DivineFavour>(Lifetime.Singleton);
            builder.Register<SkillDefinitions>(Lifetime.Singleton);
            builder.Register<DeityDefinitions>(Lifetime.Singleton);

            foreach (var type in typeof(DefinitionCatalog).Assembly.GetTypes()
                         .Where(type => type.IsDefined(typeof(DefaultCatalogAttribute), false)))
            {
                // Authored defaults fill registrations not supplied by the composing caller.
                if (builder.Exists(type)) continue;
                var declaration = type.GetCustomAttribute<DefaultCatalogAttribute>();
                var catalog = Resources.Load(declaration.ResourceName, type);
                if (!catalog) throw new InvalidOperationException($"Required catalog '{declaration.ResourceName}' is missing.");
                builder.RegisterInstance(catalog, type);
            }
        }
    }
}
