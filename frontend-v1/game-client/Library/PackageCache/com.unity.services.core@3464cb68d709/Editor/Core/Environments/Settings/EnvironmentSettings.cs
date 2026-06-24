using System;

namespace Unity.Services.Core.Editor.Settings
{
    class EnvironmentSettings
    {
        public string EnvironmentName { get; set; }
        public Guid EnvironmentId { get; set; }

        public EnvironmentSettings()
        {
            EnvironmentName = string.Empty;
            EnvironmentId = Guid.Empty;
        }

        public EnvironmentSettings(EnvironmentSettings env)
        {
            EnvironmentName = env == null ? "" : env.EnvironmentName;
            EnvironmentId = env == null ? Guid.Empty : env.EnvironmentId;
        }

        public EnvironmentSettings(string environmentName, Guid environmentId)
        {
            EnvironmentName = environmentName;
            EnvironmentId = environmentId;
        }
    }
}
