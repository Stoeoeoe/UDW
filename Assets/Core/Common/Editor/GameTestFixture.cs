using System;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.ExceptionServices;
using MoreMountains.Tools;
using NUnit.Framework;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Common.Editor
{
    /// <summary>Explicit singleton composition and lifecycle cleanup for isolated EditMode tests.</summary>
    internal sealed class GameTestFixture : IDisposable
    {
        private sealed class Service
        {
            public MonoBehaviour Component;
            public FieldInfo Singleton;
            public bool Awakened;
            public bool Enabled;
        }

        private readonly List<Service> _services = new();
        private readonly List<Object> _assets = new();
        public GameObject Root { get; }

        public GameTestFixture(string name = "Game test services")
        {
            Assert.That(Application.isPlaying, Is.False, "Use the real scene lifecycle in PlayMode tests.");
            Root = new GameObject(name);
            Root.SetActive(false);
        }

        /// <summary>Configures a manager before Awake, then registers and enables it. Dependencies must be added first.</summary>
        public T AddSingleton<T>(Action<T> configure = null) where T : MonoBehaviour =>
            AddSingleton(configure, initialize: true);

        /// <summary>Registers an isolated service without scene startup; used by tests of location registration itself.</summary>
        public T RegisterSingleton<T>(Action<T> configure = null) where T : MonoBehaviour =>
            AddSingleton(configure, initialize: false);

        private T AddSingleton<T>(Action<T> configure, bool initialize) where T : MonoBehaviour
        {
            var singletonBase = typeof(T).BaseType;
            while (singletonBase != null && !(singletonBase.IsGenericType &&
                   (singletonBase.GetGenericTypeDefinition() == typeof(Singleton<>) ||
                    singletonBase.GetGenericTypeDefinition() == typeof(MMSingleton<>))))
                singletonBase = singletonBase.BaseType;
            if (singletonBase == null) throw new ArgumentException($"{typeof(T).Name} is not a supported singleton.");
            var field = singletonBase.GetField("_instance", BindingFlags.Static | BindingFlags.NonPublic);
            Assert.That((Object)field.GetValue(null) == null, Is.True, $"A live {typeof(T).Name} already exists.");
            var owner = new GameObject(typeof(T).Name);
            owner.SetActive(false);
            owner.transform.SetParent(Root.transform, false);
            var component = owner.AddComponent<T>();
            var service = new Service { Component = component, Singleton = field };
            _services.Add(service);
            configure?.Invoke(component);
            // More Mountains skips registration in EditMode; Core.Singleton registers during Awake.
            if (!initialize || singletonBase.GetGenericTypeDefinition() == typeof(MMSingleton<>))
                field.SetValue(null, component);
            if (initialize)
            {
                service.Awakened = true;
                Invoke(component, "Awake");
                Assert.That(field.GetValue(null), Is.SameAs(component));
                service.Enabled = true;
                InvokeOptional(component, "OnEnable");
            }
            return component;
        }

        /// <summary>Owns a temporary asset until managers have been shut down.</summary>
        public T Own<T>(T asset) where T : Object { _assets.Add(asset); return asset; }

        /// <summary>Builds a locally bound character from the authored prefab, without entering a location or binding a player save.</summary>
        public Character.MainCharacter CreateCharacter(string name = "Test character")
        {
            var holder = new GameObject(name);
            holder.SetActive(false);
            holder.transform.SetParent(Root.transform);
            var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Character/Player/TestCharacter.prefab");
            var character = Object.Instantiate(prefab, holder.transform).GetComponent<Character.MainCharacter>();
            Invoke(character.GetComponent<Character.Controller2D>(), "Awake");
            character.MainInventory.EnsureInitialized();
            Invoke(character, "Awake");
            character.Health.Initialize(new Character.HealthState());
            character.Stamina.Initialize(new Character.StaminaState());
            Invoke(character.Occupation, "Awake");
            return character;
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
            // Dependents stop while the services they use are still available.
            for (var i = _services.Count - 1; i >= 0; i--)
            {
                var service = _services[i];
                if (service.Enabled) InvokeOptional(service.Component, "OnDisable");
                if (service.Awakened) InvokeOptional(service.Component, "OnDestroy");
                service.Singleton.SetValue(null, null);
                Object.DestroyImmediate(service.Component.gameObject);
            }
            Object.DestroyImmediate(Root);
            for (var i = _assets.Count - 1; i >= 0; i--) Object.DestroyImmediate(_assets[i]);
        }
    }
}
