using Unity.Services.Core.Internal;
using UnityEngine.Scripting;

namespace Unity.Services.Authentication.Internal
{
    /// <summary>
    /// Component allowing consumer packages (e.g., Live Releases, Insights, IAP)
    /// to declare that they require Authentication targeting attributes to be
    /// transmitted on sign-in.
    /// </summary>
    /// <remarks>
    /// When at least one consumer is registered, targeting is enabled by default.
    /// The application can still override the effective state via
    /// <c>AuthenticationService.Instance.Targeting.SetEnabled(bool)</c> for
    /// privacy/consent flows.
    /// </remarks>
    [RequireImplementors]
    public interface ITargetingActivation : IServiceComponent
    {
        /// <summary>
        /// Register the calling package as requiring targeting attributes.
        /// Idempotent: registering the same name twice has no additional effect.
        /// </summary>
        /// <param name="consumerName">
        /// The consumer package identifier, typically the package name
        /// (e.g., "com.unity.purchasing"). Used for diagnostic messages.
        /// </param>
        void RegisterConsumer(string consumerName);
    }
}
