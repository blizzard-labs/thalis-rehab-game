using System;
using UnityEngine;

namespace Unity.Services.Core
{
    /// <summary>
    /// Helper class to be notified when a service is initialized
    /// </summary>
    /// <typeparam name="T">The service to be observed</typeparam>
    public class ServiceObserver<T> : IDisposable
    {
        /// <summary>
        /// Event raised once the service is initialized
        /// </summary>
        public event Action<T> Initialized;

        /// <summary>
        /// Access to the service once initialized
        /// </summary>
        public T Service { get; private set; }

        IUnityServices m_Registry;

        /// <summary>
        /// Create an observer for a specific service interface to be notified when a service is initialized.
        /// This observes the global service registry.
        /// </summary>
        public ServiceObserver() : this(UnityServices.Instance)
        {
            if (!Application.isPlaying)
                return;
            m_Registry = UnityServices.Instance; //always null in edit-time
            Init();
        }

        /// <summary>
        /// Create an observer for a specific service interface to be notified when a service is initialized
        /// </summary>
        /// <param name="registry">The service registry to observe</param>
        /// <exception cref="ArgumentNullException">Thrown if the provided registry is invalid</exception>
        public ServiceObserver(IUnityServices registry)
        {
            m_Registry = registry ?? throw new ArgumentNullException(nameof(registry));
            Init();
        }

        void Init()
        {
            if (m_Registry.State == ServicesInitializationState.Initialized)
            {
                AssignService();
            }
            else
            {
                m_Registry.Initialized -= AssignService;
                m_Registry.Initialized += AssignService;
            }
        }

        void AssignService()
        {
            Service = m_Registry.GetService<T>();

            if (Service != null)
            {
                Initialized?.Invoke(Service);
            }
        }

        /// <summary>
        /// Unregisters event and resets registry
        /// </summary>
        public void Dispose()
        {
            if (m_Registry == null)
            {
                return;
            }

            m_Registry.Initialized -= AssignService;
            m_Registry = null;
        }
    }
}
