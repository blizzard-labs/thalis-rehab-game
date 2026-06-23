using Unity.Services.Core.Internal;

namespace Unity.Services.Authentication.Internal
{
    /// <summary>
    /// Component providing the Release Context
    /// </summary>
    public interface ITargetingContext : IServiceComponent
    {
        /// <summary>
        /// Returns the array of Variant Tags provided by Auth if any
        /// </summary>
        string[] VariantTags { get; }

    }
}
