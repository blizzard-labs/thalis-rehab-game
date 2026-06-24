using System;
using Unity.Services.Core.Internal;
#if UNITY_2020_2_OR_NEWER
using UnityEngine.Scripting;
#endif

namespace Unity.Services.Authentication.Internal
{
    /// <summary>
    /// Contract for objects providing information with the player name for currently signed in player.
    /// </summary>
#if UNITY_2020_2_OR_NEWER
    [RequireImplementors]
#endif
    public interface IPlayerNameComponent : IServiceComponent
    {
        /// <summary>
        /// The name of the player.
        /// </summary>
        string PlayerName { get; }

        /// <summary>
        /// Event raised when the player name changed.
        /// </summary>
        event Action<string> PlayerNameChanged;
    }
}
