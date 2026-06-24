using System.Threading.Tasks;
using Unity.Services.Core.Internal;

namespace Unity.Services.Core.Telemetry.Internal
{
    interface IDiagnosticsComponentProvider
    {
        Task<IDiagnosticsFactory> CreateDiagnosticsComponents(CoreRegistry registry);

        Task<string> GetSerializedProjectConfigurationAsync(CoreRegistry registry);
    }
}
