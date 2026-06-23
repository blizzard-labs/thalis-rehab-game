using Unity.Services.Core.Internal;

namespace Unity.Services.Core.Device.Internal
{
    /// <summary>
    /// Component providing a Unity Engine Installation Identifier
    /// </summary>
    public interface IEngineInstallationId : IServiceComponent
    {
        /// <summary>
        /// Returns Unity Engine Installation Identifier
        /// </summary>
        /// <returns>The Engine Installation Identifier</returns>
        string GetOrCreateIdentifier();
    }
}
