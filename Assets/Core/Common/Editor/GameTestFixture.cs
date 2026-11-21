using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using Animancer;
using Character;
using Character.Abilities;
using Core.Catalogs;
using Core.Context;
using Core.Game;
using Core.Inventory;
using Core.Location;
using Core.Scripting;
using Core.Spawning;
using Core.Tile;
using Core.TimeAndWeather;
using Interaction;
using MoreMountains.Tools;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Object = UnityEngine.Object;

namespace Core.Common.Editor
{
    /// <summary>Uses the authored manager graph with an isolated container and explicit EditMode lifecycle.</summary>
    internal sealed class GameTestFixture : IDisposable
    {
        private readonly List<MonoBehaviour> _services = new();
        private readonly List<FieldInfo> _vendorSingletons = new();
        private readonly List<Action<IContainerBuilder>> _overrides = new();
        private readonly List<Object> _assets = new();
        private readonly List<GameCharacter> _characters = new();
        private readonly List<IDisposable> _disposables = new();
        private IObjectResolver _container;
        private readonly string _name;
        private readonly bool _sceneServices;
        private GameObject _root;
        private GameObject _serviceRoot;
        public GameObject Root
        {
            get
            {
                if (_root) return _root;
                _root = new GameObject(_name);
                _root.SetActive(false);
                return _root;
            }
        }
        public GameState State => Get<GameState>();
        public LuaRuntime Lua => Get<LuaRuntime>();
        public GameClock Clock => Get<GameClock>();
        public CharacterManager Characters => Get<CharacterManager>();
        public LocationData Location
        {
            get => Get<LocationContext>().Location;
            set => Get<LocationContext>().Location = value;
        }
        public bool Ready
        {
            get => Get<LocationContext>().SceneReady;
            set => Get<LocationContext>().SceneReady = value;
        }
        private IObjectResolver Container => _container ?? Build();
        public LuaBindingRegistry Bind(params object[] modules)
        {
            foreach (var module in modules) Container.Inject(module);
            return new LuaBindingRegistry(modules) { Runtime = Lua };
        }
        public LuaBindingRegistry BindSequence(IEnumerable<CutsceneStep> steps, string context,
            params (Type Type, Func<object> Create)[] factories)
        {
            var bindings = CutsceneBindings.BindSequence(steps, context,
                factories.Select(factory => (factory.Type, (Func<object>)(() => Inject(factory.Create())))).ToArray());
            bindings.Runtime = Lua;
            return bindings;
        }
        public T Get<T>() => Container.Resolve<T>();
        public T Inject<T>(T value) where T : class { Container.Inject(value); return value; }
        public void Inject(GameObject value) => Container.InjectGameObject(value);
        public T InjectObject<T>(T value) where T : class
        {
            if (value is GameObject gameObject) Container.InjectGameObject(gameObject);
            else Container.Inject(value);
            return value;
        }

        public GameTestFixture(string name = "Game test services", bool sceneServices = true)
        {
            Assert.That(Application.isPlaying, Is.False, "Use the real scene lifecycle in PlayMode tests.");
            _name = name;
            _sceneServices = sceneServices;
        }

        /// <summary>Replace an injected dependency before resolving services, using the same container registrations as gameplay.</summary>
        public T Use<T>(T value) where T : class
        {
            Assert.That(_container, Is.Null, "Configure test dependencies before resolving services.");
            _overrides.Add(builder => builder.RegisterInstance(value, typeof(T)));
            return value;
        }

        private DefinitionCatalog _catalog;
        public DefinitionCatalog Catalog<T>(params Object[] definitions) where T : Object
        {
            Assert.That(_container, Is.Null, "Configure test definitions before resolving services.");
            if (!_catalog) _catalog = Use(Own(Object.Instantiate(Resources.Load<DefinitionCatalog>(DefinitionCatalog.ResourceName))));
            _catalog.Synchronize(_catalog.Entries.Where(entry => !typeof(T).IsInstanceOfType(entry.Definition))
                .Select(entry => entry.Definition).Concat(definitions));
            return _catalog;
        }

        private IObjectResolver Build()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(SystemRoot.PrefabPath);
            var builder = new ContainerBuilder();
            try
            {
                foreach (var configure in _overrides) configure(builder);
                if (_sceneServices)
                {
                    _serviceRoot = new GameObject("Services");
                    _serviceRoot.SetActive(false);
                    _serviceRoot.transform.SetParent(Root.transform, false);
                    var services = Object.Instantiate(prefab, _serviceRoot.transform);
                    SystemRoot.ConfigureServices(builder, services);
                }
                else prefab.GetComponent<SystemRoot>().RegisterServices(builder);
                _container = builder.Build();
                return _container;
            }
            catch { if (_root) Object.DestroyImmediate(_root); throw; }
        }

        /// <summary>Run only the manager callbacks exercised by this test; other services remain injected and inactive.</summary>
        public T Start<T>(Action<T> configure = null) where T : MonoBehaviour
        {
            var component = RegisterManager(configure);
            Assert.That(_services, Has.No.Member(component), "Start a manager once per fixture.");
            Invoke(component, "Awake");
            InvokeOptional(component, "OnEnable");
            _services.Add(component);
            return component;
        }

        /// <summary>Registers an isolated service without scene startup; used by tests of location registration itself.</summary>
        public T RegisterManager<T>(Action<T> configure = null) where T : MonoBehaviour
        {
            _ = Container;
            var component = Root.GetComponentInChildren<T>(true);
            if (!component)
            {
                var owner = new GameObject(typeof(T).Name);
                owner.SetActive(false);
                owner.transform.SetParent(_serviceRoot.transform, false);
                component = owner.AddComponent<T>();
            }
            _container.Inject(component);
            configure?.Invoke(component);
            component.transform.SetParent(Root.transform, true);
            // Vendor sound/time components retain their package's own lifecycle contract.
            for (var type = typeof(T).BaseType; type != null; type = type.BaseType)
                if (type.IsGenericType && (type.GetGenericTypeDefinition() == typeof(MMSingleton<>) ||
                                          type.GetGenericTypeDefinition() == typeof(MMPersistentSingleton<>)))
                {
                    var singleton = type.GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic);
                    Assert.That((Object)singleton.GetValue(null) == null, Is.True);
                    singleton.SetValue(null, component);
                    _vendorSingletons.Add(singleton);
                    break;
                }
            return component;
        }

        /// <summary>Builds a spawner over exactly these prefabs instead of the authored catalog; it is disposed with the fixture.</summary>
        public WorldObjectSpawner CreateSpawner(params SpawnedObject[] prefabs)
        {
            var catalog = Asset<DefinitionCatalog>();
            catalog.Synchronize(prefabs);
            var spawner = new WorldObjectSpawner(Get<IObjectResolver>(), State, Get<MapManager>(), catalog);
            _disposables.Add(spawner);
            return spawner;
        }

        /// <summary>Owns a temporary asset until managers have been shut down.</summary>
        public T Own<T>(T asset) where T : Object { _assets.Add(asset); return asset; }
        public T Asset<T>() where T : ScriptableObject => Own(ScriptableObject.CreateInstance<T>());

        public T Create<T>() where T : Component
        {
            var owner = new GameObject(typeof(T).Name);
            owner.SetActive(false);
            owner.transform.SetParent(Root.transform, false);
            var component = owner.AddComponent<T>();
            Container.InjectGameObject(owner);
            return component;
        }

        /// <summary>Adds an injected component to a test-owned object.</summary>
        public T Add<T>(GameObject owner) where T : Component
        {
            var component = owner.AddComponent<T>();
            Container.InjectGameObject(owner);
            return component;
        }

        public T Instantiate<T>(T prefab) where T : Component => Container.Instantiate(prefab, Root.transform);
        public GameObject Instantiate(GameObject prefab) => Container.Instantiate(prefab, Root.transform);

        public SlotInventory Inventory(int slots) => Inventory(new InventoryState { Slots = new InventorySlotState[slots] });

        public SlotInventory Inventory(InventoryState state, Func<string, ItemDefinition> resolve = null)
        {
            var inventory = Create<SlotInventory>();
            inventory.Bind(state, resolve);
            return inventory;
        }

        /// <summary>Builds a locally bound character from the authored prefab, without entering a location or binding a player save.</summary>
        public MainCharacter CreateCharacter(string name = "Test character")
        {
            var holder = new GameObject(name);
            holder.SetActive(false);
            holder.transform.SetParent(Root.transform);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            var character = Container.Instantiate(prefab, holder.transform).GetComponent<MainCharacter>();
            Invoke(character.GetComponent<Controller2D>(), "Awake");
            character.MainInventory.EnsureInitialized();
            Invoke(character, "Awake");
            // Inactive parents are excluded by abilities' normal Awake lookup. Bind this isolated fixture explicitly.
            var primary = character.PerformPrimaryAction;
            foreach (var ability in character.GetComponentsInChildren<CharacterAbility>(true))
                Reflect.Set(ability, "Character", character);
            primary.ActionExecutor = new ActionExecutor(character, () => Get<PlayerInteractionContext>().CurrentSnapshot);
            character.Health.Initialize(new HealthState());
            character.Stamina.Initialize(new StaminaState());
            Invoke(character.Occupation, "Awake");
            _characters.Add(character);
            return character;
        }

        /// <summary>Creates a character and registers it as the session's player, as MainCharacter does when it starts.</summary>
        public MainCharacter CreatePlayer(string name = "Player")
        {
            var player = CreateCharacter(name);
            Characters.RegisterMainCharacter(player);
            return player;
        }

        public MainCharacter CreateAnimatedCharacter()
        {
            var character = CreateCharacter();
            character.EnsureRuntimeInitialized();
            character.Graphics.gameObject.SetActive(true);
            Invoke(character.Animator, "Awake");
            Invoke(character.GetComponentInChildren<NamedAnimancerComponent>(true), "Awake");
            character.transform.parent.gameObject.SetActive(true);
            Root.SetActive(true);
            return character;
        }

        /// <summary>Places the authored character's physical footprint at a world point, preserving its child offsets.</summary>
        public static void PlaceCharacterAtGroundPoint(GameCharacter character, Vector3 point)
        {
            var body = character.GetComponent<BoxCollider2D>();
            character.transform.position += point - body.transform.TransformPoint(body.offset);
        }

        /// <summary>Runs Awake then OnEnable, where declared, on each component. EditMode does not do this for objects built in a test.</summary>
        public void Wake(params Component[] components)
        {
            foreach (var component in components)
            {
                InvokeOptional(component, "Awake");
                InvokeOptional(component, "OnEnable");
            }
        }

        /// <summary>Wakes every component of an object, parents first, as Unity would on activation.</summary>
        public GameObject Wake(GameObject owner)
        {
            Wake(owner.GetComponentsInChildren<MonoBehaviour>(true));
            return owner;
        }

        /// <summary>Runs a lifecycle callback explicitly when EditMode does not invoke it.</summary>
        public static void Invoke(object target, string method)
        {
            var callback = FindCallback(target.GetType(), method)
                ?? throw new MissingMethodException(target.GetType().Name, method);
            Call(callback, target);
        }

        private static void InvokeOptional(object target, string method)
        {
            var callback = FindCallback(target.GetType(), method);
            if (callback != null) Call(callback, target);
        }

        private static MethodInfo FindCallback(Type type, string method)
        {
            for (; type != null; type = type.BaseType)
            {
                var callback = type.GetMethod(method, BindingFlags.Instance | BindingFlags.Public |
                    BindingFlags.NonPublic | BindingFlags.DeclaredOnly, null, Type.EmptyTypes, null);
                if (callback != null) return callback;
            }
            return null;
        }

        private static void Call(MethodInfo callback, object target)
        {
            try { callback.Invoke(target, null); }
            catch (TargetInvocationException error) { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); }
        }

        public void Dispose()
        {
            // These actors were awakened explicitly while inactive; release their subscriptions before services disappear.
            foreach (var character in _characters)
                if (character)
                {
                    InvokeOptional(character, "OnDisable");
                    Invoke(character.PerformPrimaryAction, "OnDestroy");
                    Invoke(character, "OnDestroy");
                }
            // Dependents stop while the services they use are still available.
            for (var i = _services.Count - 1; i >= 0; i--)
            {
                InvokeOptional(_services[i], "OnDisable");
                InvokeOptional(_services[i], "OnDestroy");
            }
            for (var i = _disposables.Count - 1; i >= 0; i--) _disposables[i].Dispose();
            foreach (var singleton in _vendorSingletons) singleton.SetValue(null, null);
            _container?.Dispose();
            if (_root) Object.DestroyImmediate(_root);
            for (var i = _assets.Count - 1; i >= 0; i--) Object.DestroyImmediate(_assets[i]);
        }
    }
}
