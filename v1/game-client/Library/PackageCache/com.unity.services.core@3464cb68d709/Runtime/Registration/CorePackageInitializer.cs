using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Unity.Services.Core.Configuration;
using Unity.Services.Core.Configuration.Internal;
using Unity.Services.Core.Device;
using Unity.Services.Core.Device.Internal;
using Unity.Services.Core.Environments;
using Unity.Services.Core.Environments.Internal;
using Unity.Services.Core.Internal;
using Unity.Services.Core.Scheduler.Internal;
using Unity.Services.Core.Telemetry.Internal;
using Unity.Services.Core.Threading.Internal;
using UnityEngine;
using NotNull = JetBrains.Annotations.NotNullAttribute;
using SuppressMessage = System.Diagnostics.CodeAnalysis.SuppressMessageAttribute;
using Newtonsoft.Json.Linq;
using Unity.Services.Core.Internal.Serialization;
#if !ENABLE_UNITY_SERVICES_VERBOSE_LOGGING
using System.Diagnostics;
#endif

namespace Unity.Services.Core.Registration
{
    [SuppressMessage("ReSharper", "RedundantTypeArgumentsOfMethod")]
    class CorePackageInitializer : IInitializablePackageV2, IDiagnosticsComponentProvider
    {
        internal const string CorePackageName = "com.unity.services.core";

        internal const string ProjectUnlinkMessage =
            "To use Unity's dashboard services, you need to link your Unity project to a project ID. To do this, go to Project Settings to select your organization, select your project and then link a project ID. You also need to make sure your organization has access to the required products. Visit https://dashboard.unity3d.com to sign up.";
        internal ActionScheduler ActionScheduler { get; private set; }

        internal InstallationId InstallationId { get; private set; }

        internal EngineInstallationId EngineInstallationId { get; private set; }

        internal ProjectConfiguration ProjectConfig { get; private set; }

        internal Environments.Internal.Environments Environments { get; private set; }


        internal ExternalUserId ExternalUserId { get; private set; }

        internal ICloudProjectId CloudProjectId { get; private set; }

        internal IDiagnosticsFactory DiagnosticsFactory { get; private set; }

        internal IMetricsFactory MetricsFactory { get; private set; }

        internal UnityThreadUtilsInternal UnityThreadUtils { get; private set; }

        readonly IJsonSerializer m_Serializer;

        InitializationOptions m_CurrentInitializationOptions;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void InitializeOnLoad()
        {
            var initializer = new CorePackageInitializer(new NewtonsoftSerializer());
            initializer.Register(CorePackageRegistry.Instance);
        }

        public void Register(CorePackageRegistry registry)
        {
            CoreDiagnostics.Instance.DiagnosticsComponentProvider = this;
            registry.Register(this)
                .ProvidesComponent<IInstallationId>()
                .ProvidesComponent<IEngineInstallationId>()
                .ProvidesComponent<ICloudProjectId>()
                .ProvidesComponent<IActionScheduler>()
                .ProvidesComponent<IEnvironments>()
                .ProvidesComponent<IProjectConfiguration>()
                .ProvidesComponent<IMetricsFactory>()
                .ProvidesComponent<IDiagnosticsFactory>()
                .ProvidesComponent<IUnityThreadUtils>()
                .ProvidesComponent<IExternalUserId>();
        }

        public CorePackageInitializer()
        {
            m_Serializer = new NewtonsoftSerializer();
        }

        public CorePackageInitializer(IJsonSerializer serializer) => m_Serializer = serializer;

        /// <summary>
        /// This is the Initialize callback that will be triggered by the Core package.
        /// This method will be invoked when the game developer calls UnityServices.InitializeAsync().
        /// </summary>
        /// <param name="registry">
        /// The registry containing components from different packages.
        /// </param>
        /// <returns>
        /// Return a Task representing your initialization.
        /// </returns>
        public Task Initialize(CoreRegistry registry)
        {
            return InitializeComponents(registry);
        }

        public Task InitializeInstanceAsync(CoreRegistry registry)
        {
            return InitializeComponents(registry);
        }

        async Task InitializeComponents(CoreRegistry registry)
        {
            try
            {
                if (HaveInitOptionsChanged(registry.Options))
                {
                    FreeOptionsDependantComponents();
                }

                // There are potential race conditions with other services we're trying to avoid by calling
                // RegisterInstallationId as the _very first_ thing we do.
                InitializeInstallationId();

                InitializeActionScheduler();

                await InitializeProjectConfigAsync(registry.Options);

                InitializeExternalUserId(ProjectConfig);

                InitializeEnvironments(ProjectConfig);
                InitializeCloudProjectId();
                if (string.IsNullOrEmpty(CloudProjectId.GetCloudProjectId()))
                {
                    throw new UnityProjectNotLinkedException(ProjectUnlinkMessage);
                }

                InitializeMetrics();
                InitializeDiagnostics();

                InitializeUnityThreadUtils();

                // Register components as late as possible to provide them only when initialization succeeded.
                RegisterProvidedComponents();
            }
            catch (Exception reason) when (SendFailedInitDiagnostic(reason))
            {
                // Shouldn't be actually called since predicate always return false.
            }

            LogInitializationInfoJson();

            void RegisterProvidedComponents()
            {
                registry.RegisterServiceComponent<IInstallationId>(InstallationId);
                registry.RegisterServiceComponent<IEngineInstallationId>(EngineInstallationId);
                registry.RegisterServiceComponent<IActionScheduler>(ActionScheduler);
                registry.RegisterServiceComponent<IProjectConfiguration>(ProjectConfig);
                registry.RegisterServiceComponent<IEnvironments>(Environments);
                registry.RegisterServiceComponent<IMetricsFactory>(MetricsFactory);
                registry.RegisterServiceComponent<IDiagnosticsFactory>(DiagnosticsFactory);
                registry.RegisterServiceComponent<ICloudProjectId>(CloudProjectId);
                registry.RegisterServiceComponent<IUnityThreadUtils>(UnityThreadUtils);
                registry.RegisterServiceComponent<IExternalUserId>(ExternalUserId);
            }

            // Fake predicate to avoid stack unwinding on rethrow.
            bool SendFailedInitDiagnostic(Exception reason)
            {
                return false;
            }
        }

        bool HaveInitOptionsChanged(InitializationOptions options)
        {
            return !(m_CurrentInitializationOptions is null)
                && !m_CurrentInitializationOptions.Values.ValueEquals(options.Values);
        }

        void FreeOptionsDependantComponents()
        {
            ProjectConfig = null;
            Environments = null;
            DiagnosticsFactory = null;
            MetricsFactory = null;
        }

        internal void InitializeInstallationId()
        {
            if (!(InstallationId is null))
                return;

            EngineInstallationId = new EngineInstallationId();
            var installationId = new InstallationId(EngineInstallationId);
            installationId.CreateIdentifier();
            InstallationId = installationId;
        }

        internal void InitializeActionScheduler()
        {
            if (!(ActionScheduler is null))
                return;

            var actionScheduler = new ActionScheduler();
            actionScheduler.JoinPlayerLoopSystem();
            ActionScheduler = actionScheduler;
        }

        internal async Task InitializeProjectConfigAsync([NotNull] InitializationOptions options)
        {
            if (!(ProjectConfig is null))
                return;

            ProjectConfig = await GenerateProjectConfigurationAsync(options);

            // Copy options in case only values are changed without changing the reference.
            m_CurrentInitializationOptions = new InitializationOptions(options);
        }

        internal async Task<ProjectConfiguration> GenerateProjectConfigurationAsync(
            [NotNull] InitializationOptions options)
        {
            var serializedConfig = await GetSerializedConfigOrEmptyAsync();
            if (serializedConfig.Keys is null
                || serializedConfig.Values is null)
            {
                serializedConfig = SerializableProjectConfiguration.Empty;
            }

            var configValues = new Dictionary<string, ConfigurationEntry>(serializedConfig.Keys.Length);
            configValues.FillWith(serializedConfig);
            configValues.FillWith(options);
            return new ProjectConfiguration(configValues, m_Serializer);
        }

        internal static async Task<SerializableProjectConfiguration> GetSerializedConfigOrEmptyAsync()
        {
            try
            {
                var config = await ConfigurationUtils.ConfigurationLoader.GetConfigAsync();
                return config;
            }
            catch (Exception e)
            {
                CoreLogger.LogError(
                    "An error occured while trying to get the project configuration for services." +
                    $"\n{e.Message}" +
                    $"\n{e.StackTrace}");
                return SerializableProjectConfiguration.Empty;
            }
        }

        internal void InitializeExternalUserId(IProjectConfiguration projectConfiguration)
        {
            // For backward compatibility, carry the analytics user id to external user id
            // Only do that if the external user id is not set already.
            // This should be removed once InitializationOptions.SetAnalyticsUserId is removed.
            if (UnityServices.ExternalUserId == null)
            {
                var analyticsUserId = projectConfiguration.GetString("com.unity.services.core.analytics-user-id");
                if (!string.IsNullOrEmpty(analyticsUserId))
                {
                    UnityServices.ExternalUserId = analyticsUserId;
                }
            }

            if (!(ExternalUserId is null))
                return;

            ExternalUserId = new ExternalUserId();
        }

        internal void InitializeEnvironments(IProjectConfiguration projectConfiguration)
        {
            if (!(Environments is null))
                return;

            var currentEnvironment = projectConfiguration.GetString(
                EnvironmentsOptionsExtensions.EnvironmentNameKey,
                EnvironmentsOptionsExtensions.EnvironmentDefaultNameValue);

            Environments = new Environments.Internal.Environments
            {
                Current = currentEnvironment,
            };
        }


        internal void InitializeMetrics()
        {
            if (!(MetricsFactory is null))
            {
                return;
            }

            MetricsFactory = new MetricsFactory();
        }

        internal void InitializeDiagnostics()
        {
            if (!(DiagnosticsFactory is null))
            {
                return;
            }

            DiagnosticsFactory = new DiagnosticsFactory();
        }

        internal void InitializeCloudProjectId(ICloudProjectId cloudProjectId = null)
        {
            if (!(CloudProjectId is null))
                return;

            CloudProjectId = cloudProjectId ?? new CloudProjectId();
        }

        internal void InitializeUnityThreadUtils()
        {
            if (!(UnityThreadUtils is null))
                return;

            UnityThreadUtils = new UnityThreadUtilsInternal();
        }

        public async Task<IDiagnosticsFactory> CreateDiagnosticsComponents(CoreRegistry registry)
        {
            if (HaveInitOptionsChanged(registry.Options))
            {
                FreeOptionsDependantComponents();
            }

            InitializeActionScheduler();
            await InitializeProjectConfigAsync(registry.Options);
            InitializeEnvironments(ProjectConfig);
            InitializeCloudProjectId();
            return DiagnosticsFactory;
        }

        /// <summary>
        /// Provides a way for developers to debug their ugs configuration by logging a public string in json format
        /// containing information relative to service initialization, project configuration and system.
        /// </summary>
#if !ENABLE_UNITY_SERVICES_VERBOSE_LOGGING
        [Conditional(CoreLogger.VerboseLoggingDefine)]
#endif
        void LogInitializationInfoJson()
        {
            var result = new JObject();
            var serializedDiagnosticCommonTags = m_Serializer.SerializeObject(DiagnosticsFactory.CommonTags);
            var diagnostics = JObject.Parse(serializedDiagnosticCommonTags);
            var projectConfig = JObject.Parse(ProjectConfig.ToJson());
            var installationId = JObject.Parse($@"{{""installation_id"": ""{InstallationId.Identifier}""}}");

            diagnostics.Merge(installationId);

            // Encapsulate diagnostics and project config data under a parent
            result.Add("CommonSettings", diagnostics);
            result.Add("ServicesRuntimeSettings", projectConfig);

            CoreLogger.LogVerbose(result.ToString());
        }

        public async Task<string> GetSerializedProjectConfigurationAsync(CoreRegistry registry)
        {
            await InitializeProjectConfigAsync(registry.Options);
            return ProjectConfig.ToJson();
        }
    }
}
