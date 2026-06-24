using System.Threading.Tasks;
using Unity.Services.Authentication.Internal;
using Unity.Services.Authentication.Server.Internal;
using Unity.Services.Core.Analytics.Internal;
using Unity.Services.Core.Configuration.Internal;
using Unity.Services.Core.Device.Internal;
using Unity.Services.Core.Environments.Internal;
using Unity.Services.Core.Internal;
using Unity.Services.Wire.Internal;
using UnityEngine;

namespace Unity.Services.Core.Editor
{
    class StatusInitializer : IInitializablePackageV2
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void InitializeOnLoad()
        {
            var initializer = new StatusInitializer();
            initializer.Register(CorePackageRegistry.Instance);
        }

        public void Register(CorePackageRegistry registry)
        {
            registry.Register(new StatusInitializer())
                .OptionallyDependsOn<IAccessToken>()
                .OptionallyDependsOn<IAccessTokenObserver>()
                .OptionallyDependsOn<IAnalyticsUserId>()
                .OptionallyDependsOn<IExternalUserId>()
                .OptionallyDependsOn<IServerAccessToken>()
                .OptionallyDependsOn<IServerEnvironmentId>()
                .OptionallyDependsOn<ICloudProjectId>()
                .OptionallyDependsOn<IEnvironments>()
                .OptionallyDependsOn<IEnvironmentId>()
                .OptionallyDependsOn<IPlayerId>()
                .OptionallyDependsOn<IPlayerNameComponent>()
                .OptionallyDependsOn<IProjectConfiguration>()
                .OptionallyDependsOn<IInstallationId>()
                .OptionallyDependsOn<IWire>();
        }

        public Task Initialize(CoreRegistry registry)
        {
            InitializeService(registry);
            return Task.CompletedTask;
        }

        public Task InitializeInstanceAsync(CoreRegistry registry)
        {
            InitializeService(registry);
            return Task.CompletedTask;
        }

        public void InitializeService(CoreRegistry registry)
        {
            var statusService = new StatusService(
                GetServiceComponent<IAccessToken>(registry),
                GetServiceComponent<IAccessTokenObserver>(registry),
                GetServiceComponent<IAnalyticsUserId>(registry),
                GetServiceComponent<IExternalUserId>(registry),
                GetServiceComponent<IServerAccessToken>(registry),
                GetServiceComponent<IServerEnvironmentId>(registry),
                GetServiceComponent<ICloudProjectId>(registry),
                GetServiceComponent<IEnvironments>(registry),
                GetServiceComponent<IEnvironmentId>(registry),
                GetServiceComponent<IPlayerId>(registry),
                GetServiceComponent<IPlayerNameComponent>(registry),
                GetServiceComponent<IProjectConfiguration>(registry),
                GetServiceComponent<IInstallationId>(registry),
                GetServiceComponent<IWire>(registry));

            registry.RegisterService<IStatusService>(statusService);
        }

        T GetServiceComponent<T>(CoreRegistry registry)
            where T : IServiceComponent
        {
            if (registry.TryGetServiceComponent<T>(out var component))
            {
                return component;
            }

            return default;
        }
    }
}
