using System.Threading;
using UnityEngine;

namespace Core.Dialogue.Vulcanus
{
    /// <summary>Waits for player input, ending the wait when the runner cancels the dialogue.</summary>
    internal static class DialogueWait
    {
        public static async Awaitable For(AwaitableCompletionSource input, CancellationToken cancellation)
        {
            using (cancellation.Register(() => input.TrySetCanceled()))
                await input.Awaitable;
        }

        public static async Awaitable<T> For<T>(AwaitableCompletionSource<T> input, CancellationToken cancellation)
        {
            using (cancellation.Register(() => input.TrySetCanceled()))
                return await input.Awaitable;
        }
    }
}
