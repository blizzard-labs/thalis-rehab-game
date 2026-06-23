using System;
using System.Collections.Generic;
using UnityEngine;

namespace Unity.Services.Core
{
    /// <summary>
    /// Coordinates static state reset for Fast Enter Play Mode compatibility.
    /// All assemblies register their reset callbacks during SubsystemRegistration,
    /// and execution is triggered by UnityServicesInitializer at AfterAssembliesLoaded.
    /// </summary>
    public static class CoreResetter
    {
        static readonly List<Action> s_ResetCallbacks = new List<Action>();

        /// <summary>
        /// Fired after all registered reset callbacks have been executed.
        /// </summary>
        public static event Action OnResetComplete;

        /// <summary>
        /// Register a callback to be invoked when statics are reset.
        /// Call this during SubsystemRegistration phase.
        /// </summary>
        /// <param name="resetCallback">The reset callback to register.</param>
        public static void Register(Action resetCallback)
        {
            if (resetCallback != null && !s_ResetCallbacks.Contains(resetCallback))
            {
                s_ResetCallbacks.Add(resetCallback);
            }
        }

        /// <summary>
        /// Execute all registered reset callbacks and fire the completion event.
        /// Called by UnityServicesInitializer at AfterAssembliesLoaded.
        /// </summary>
        internal static void ExecuteResets()
        {
            foreach (var callback in s_ResetCallbacks)
            {
                try
                {
                    callback();
                }
                catch (Exception e)
                {
                    Debug.LogException(e);
                }
            }

            OnResetComplete?.Invoke();

            s_ResetCallbacks.Clear();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void RegisterCoreCallbacks()
        {
            Register(UnityServicesBuilder.ResetStaticsOnLoad);
            Register(UnityServices.ResetStaticsOnLoad);
            Register(UnityThreadUtils.CaptureUnityThreadInfo);
        }
    }
}
