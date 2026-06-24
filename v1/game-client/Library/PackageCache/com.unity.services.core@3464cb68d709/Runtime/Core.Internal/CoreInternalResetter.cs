using UnityEngine;

namespace Unity.Services.Core.Internal
{
    /// <summary>
    /// Registers reset callbacks for the Core.Internal assembly with the CoreResetter.
    /// </summary>
    static class CoreInternalResetter
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void RegisterCallbacks()
        {
            CoreResetter.Register(CoreRegistry.ResetStaticsOnLoad);
            CoreResetter.Register(CorePackageRegistry.ResetStaticsOnLoad);
            CoreResetter.Register(CoreMetrics.ResetStaticsOnLoad);
            CoreResetter.Register(CoreDiagnostics.ResetStaticsOnLoad);
        }
    }
}
