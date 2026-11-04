using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace Core
{
    /// <summary>Wires authored scene components before their Awake/OnEnable callbacks.</summary>
    [DefaultExecutionOrder(-1500)]
    public sealed class GameSceneScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            builder.RegisterBuildCallback(container =>
            {
                foreach (var root in gameObject.scene.GetRootGameObjects())
                    container.InjectGameObject(root);
            });
        }
    }
}
