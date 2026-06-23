using UnityEngine;

namespace Unity.Services.Core.Configuration
{
    /// <summary>
    /// Registers reset callbacks for the Configuration assembly with the CoreResetter.
    /// </summary>
    static class ConfigurationResetter
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void RegisterCallbacks()
        {
            CoreResetter.Register(ConfigurationUtils.ResetStaticsOnLoad);
        }
    }
}
