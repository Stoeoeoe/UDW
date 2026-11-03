using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.ExceptionServices;
using MoreMountains.Tools;
using NUnit.Framework;
using Core.Catalogs;
using Core.Inventory;
using Core.Location;
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
        private readonly List<Character.GameCharacter> _characters = new();
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
        public Game.GameState State => Get<Game.GameState>();
        public Scripting.LuaRuntime Lua => Get<Scripting.LuaRuntime>();
        public LocationData Location
        {
            get => Get<LocationContext>().Location;
            set => typeof(LocationContext).GetProperty(nameof(LocationContext.Location))
                .SetValue(Get<LocationContext>(), value);
        }
        public bool Ready
        {
            get => Get<LocationContext>().SceneReady;
            set => typeof(LocationContext).GetProperty(nameof(LocationContext.SceneReady))
                .SetValue(Get<LocationContext>(), value);
        }
        private IObjectResolver Container => _container ?? Build();
        public Scripting.LuaBindingRegistry Bind(params object[] modules)
        {
            foreach (var module in modules) Container.Inject(module);
            return new Scripting.LuaBindingRegistry(modules) { Runtime = Lua };
        }
        public Scripting.LuaBindingRegistry BindSequence(IEnumerable<Scripting.CutsceneStep> steps, string context,
            params (Type Type, Func<object> Create)[] factories)
        {
            var bindings = Scripting.CutsceneBindings.BindSequence(steps, context,
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

        public T Catalog<T>(params Object[] definitions) where T : DefinitionCatalog
        {
            var catalog = Asset<T>();
            catalog.Synchronize(definitions);
            return Use(catalog);
        }

        private IObjectResolver Build()
        {
            var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Resources/SystemRoot.prefab");
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
                else
                {
                    var configuration = prefab.GetComponent<SystemRoot>();
                    GameServices.Register(builder, configuration.Player, configuration.Items);
                }
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
        public Character.MainCharacter CreateCharacter(string name = "Test character")
        {
            var holder = new GameObject(name);
            holder.SetActive(false);
            holder.transform.SetParent(Root.transform);
            var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            var character = Container.Instantiate(prefab, holder.transform).GetComponent<Character.MainCharacter>();
            Invoke(character.GetComponent<Character.Controller2D>(), "Awake");
            character.MainInventory.EnsureInitialized();
            Invoke(character, "Awake");
            // Inactive parents are excluded by abilities' normal Awake lookup. Bind this isolated fixture explicitly.
            var primary = character.PerformPrimaryAction;
            foreach (var ability in character.GetComponentsInChildren<Character.Abilities.CharacterAbility>(true))
                typeof(Character.Abilities.CharacterAbility).GetField("Character", BindingFlags.Instance | BindingFlags.NonPublic)
                    .SetValue(ability, character);
            typeof(Character.Abilities.CharacterPerformPrimaryActionAbility).GetProperty("ActionExecutor")
                .SetValue(primary, new Interaction.ActionExecutor(character, () => Get<Core.Context.PlayerInteractionContext>().CurrentSnapshot));
            character.Health.Initialize(new Character.HealthState());
            character.Stamina.Initialize(new Character.StaminaState());
            Invoke(character.Occupation, "Awake");
            _characters.Add(character);
            return character;
        }

        public Character.MainCharacter CreateAnimatedCharacter()
        {
            var character = CreateCharacter();
            character.EnsureRuntimeInitialized();
            character.Graphics.gameObject.SetActive(true);
            Invoke(character.Animator, "Awake");
            Invoke(character.GetComponentInChildren<Animancer.NamedAnimancerComponent>(true), "Awake");
            character.transform.parent.gameObject.SetActive(true);
            Root.SetActive(true);
            return character;
        }

        /// <summary>Places the authored character's physical footprint at a world point, preserving its child offsets.</summary>
        public static void PlaceCharacterAtGroundPoint(Character.GameCharacter character, Vector3 point)
        {
            var body = character.GetComponent<BoxCollider2D>();
            character.transform.position += point - body.transform.TransformPoint(body.offset);
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
            foreach (var singleton in _vendorSingletons) singleton.SetValue(null, null);
            _container?.Dispose();
            if (_root) Object.DestroyImmediate(_root);
            for (var i = _assets.Count - 1; i >= 0; i--) Object.DestroyImmediate(_assets[i]);
        }
    }
}
