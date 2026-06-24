using Unity.Services.Core.Device.Internal;

namespace Unity.Services.Core.Device
{
    class UnityEngineIdentifier : IUserIdentifierProvider
    {
        internal IEngineInstallationId EngineInstallationId;

        public string UserId
        {
            get => EngineInstallationId.GetOrCreateIdentifier();
            set { }
        }

        public UnityEngineIdentifier(IEngineInstallationId engineInstallationId)
        {
            EngineInstallationId = engineInstallationId;
        }
    }
}
