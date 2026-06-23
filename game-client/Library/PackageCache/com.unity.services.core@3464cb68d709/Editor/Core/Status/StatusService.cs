using Unity.Services.Authentication.Internal;
using Unity.Services.Authentication.Server.Internal;
using Unity.Services.Core.Analytics.Internal;
using Unity.Services.Core.Configuration.Internal;
using Unity.Services.Core.Device.Internal;
using Unity.Services.Core.Environments.Internal;
using Unity.Services.Wire.Internal;

namespace Unity.Services.Core.Editor
{
    interface IStatusService
    {
        public IAccessToken AccessTokenProvider { get; }
        public IAnalyticsUserId AnalyticsUserIdProvider { get; }
        public IExternalUserId ExternalUserIdProvider { get; }
        public ICloudProjectId CloudProjectIdProvider { get; }
        public IEnvironments EnvironmentProvider { get; }
        public IEnvironmentId EnvironmentIdProvider { get; }
        public IPlayerId PlayerIdProvider { get; }
        public IPlayerNameComponent PlayerNameProvider { get; }
        public IProjectConfiguration ProjectConfiguration { get; }
        public IInstallationId InstallationIdProvider { get; }
        public IWire Wire { get; }

        public IServerAccessToken ServerAccessTokenProvider { get; }
        public IServerEnvironmentId ServerEnvironmentIdProvider { get; }

        public void Reset();
        public string GetState();

        string PlayerAccessToken { get; }
        string PlayerAccessTokenDecoded { get; }

        string ServerAccessToken { get; }
        string ServerAccessTokenDecoded { get; }
    }

    class StatusService : IStatusService
    {
        public IAccessToken AccessTokenProvider { get; private set; }
        public IAccessTokenObserver AccessTokenObserverProvider { get; private set; }
        public IAnalyticsUserId AnalyticsUserIdProvider { get; private set; }
        public IExternalUserId ExternalUserIdProvider { get; private set; }
        public ICloudProjectId CloudProjectIdProvider { get; private set; }
        public IEnvironments EnvironmentProvider { get; private set; }
        public IEnvironmentId EnvironmentIdProvider { get; private set; }
        public IPlayerId PlayerIdProvider { get; private set; }
        public IPlayerNameComponent PlayerNameProvider { get; private set; }
        public IProjectConfiguration ProjectConfiguration { get; private set; }
        public IInstallationId InstallationIdProvider { get; private set; }
        public IWire Wire { get; private set; }
        public IServerAccessToken ServerAccessTokenProvider { get; private set; }
        public IServerEnvironmentId ServerEnvironmentIdProvider { get; private set; }

        ServicesInitializationState State { get; set; }
        string InitState { get; set; }

        public string PlayerAccessToken { get; private set; }
        public string PlayerAccessTokenDecoded { get; private set; }

        public string ServerAccessToken { get; private set; }
        public string ServerAccessTokenDecoded { get; private set; }

        public StatusService(
            IAccessToken accessToken,
            IAccessTokenObserver accessTokenObserver,
            IAnalyticsUserId analyticsUserId,
            IExternalUserId externalUserId,
            IServerAccessToken serverAccessToken,
            IServerEnvironmentId serverEnvironmentId,
            ICloudProjectId cloudProjectId,
            IEnvironments environment,
            IEnvironmentId environmentId,
            IPlayerId playerId,
            IPlayerNameComponent playerName,
            IProjectConfiguration projectConfiguration,
            IInstallationId installationId,
            IWire wire)
        {
            AccessTokenProvider = accessToken;
            AccessTokenObserverProvider = accessTokenObserver;
            AnalyticsUserIdProvider = analyticsUserId;
            ExternalUserIdProvider = externalUserId;
            ServerAccessTokenProvider = serverAccessToken;
            ServerEnvironmentIdProvider = serverEnvironmentId;
            CloudProjectIdProvider = cloudProjectId;
            EnvironmentProvider = environment;
            EnvironmentIdProvider = environmentId;
            PlayerIdProvider = playerId;
            PlayerNameProvider = playerName;
            ProjectConfiguration = projectConfiguration;
            InstallationIdProvider = installationId;
            Wire = wire;

            if (AccessTokenObserverProvider != null)
            {
                AccessTokenObserverProvider.AccessTokenChanged += OnPlayerAccessTokenChanged;
            }

            if (ServerAccessTokenProvider != null)
            {
                ServerAccessTokenProvider.AccessTokenChanged += OnServerAccessTokenChanged;
            }
        }

        public void Reset()
        {
            if (AccessTokenObserverProvider != null)
            {
                AccessTokenObserverProvider.AccessTokenChanged -= OnPlayerAccessTokenChanged;
            }

            if (ServerAccessTokenProvider != null)
            {
                ServerAccessTokenProvider.AccessTokenChanged -= OnServerAccessTokenChanged;
            }

            AccessTokenProvider = null;
            AccessTokenObserverProvider = null;
            AnalyticsUserIdProvider = null;
            ExternalUserIdProvider = null;
            CloudProjectIdProvider = null;
            EnvironmentProvider = null;
            EnvironmentIdProvider = null;
            PlayerIdProvider = null;
            PlayerNameProvider = null;
            ProjectConfiguration = null;
            InstallationIdProvider = null;
            ServerAccessTokenProvider = null;
            ServerEnvironmentIdProvider = null;
            Wire = null;
        }

        public string GetState()
        {
            if (UnityServices.State != State || string.IsNullOrEmpty(InitState))
            {
                State = UnityServices.State;
                InitState = State.ToString();
            }

            return InitState;
        }

        void OnPlayerAccessTokenChanged(string accessToken)
        {
            PlayerAccessToken = accessToken;
            PlayerAccessTokenDecoded = accessToken != null ? JsonWebToken.DecodePayload(accessToken, true) : string.Empty;
        }

        void OnServerAccessTokenChanged(string accessToken)
        {
            ServerAccessToken = accessToken;
            ServerAccessTokenDecoded = accessToken != null ? JsonWebToken.DecodePayload(accessToken, true) : string.Empty;
        }
    }
}
