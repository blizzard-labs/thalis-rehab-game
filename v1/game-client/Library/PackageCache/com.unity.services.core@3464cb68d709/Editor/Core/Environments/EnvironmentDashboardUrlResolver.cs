using System;
using Unity.Services.Core.Editor.OrganizationHandler;

namespace Unity.Services.Core.Editor.Environments
{
    class EnvironmentDashboardUrlResolver : IEnvironmentDashboardUrlResolver
    {
        readonly ICloudEnvironmentConfigurationProvider m_CloudEnvironmentConfigProvider;
        readonly IOrganizationHandler m_OrganizationHandler;
        readonly IProjectInfo m_ProjectInfo;

        internal EnvironmentDashboardUrlResolver(
            ICloudEnvironmentConfigurationProvider cloudEnvironmentConfigProvider,
            IOrganizationHandler organizationHandler,
            IProjectInfo projectInfo)
        {
            m_CloudEnvironmentConfigProvider = cloudEnvironmentConfigProvider;
            m_OrganizationHandler = organizationHandler;
            m_ProjectInfo = projectInfo;
        }

        public EnvironmentDashboardUrlResolver()
            : this(new CloudEnvironmentConfigProvider(), new OrganizationHandler.OrganizationHandler(), new ProjectInfo())
        {
        }

        string GetHost()
        {
            return m_CloudEnvironmentConfigProvider.IsStaging()
                ? "https://staging.cloud.unity.com"
                : "https://cloud.unity.com";
        }

        public string ManageEnvironments()
        {
            var host = GetHost();
            return $"{host}/home/organizations/{m_OrganizationHandler.Key}/projects/{m_ProjectInfo.ProjectId}/settings/environments";
        }

        public string ManageReleasePointers(Guid environmentId)
        {
            var host = GetHost();
            return $"{host}/home/organizations/{m_OrganizationHandler.Key}/projects/{m_ProjectInfo.ProjectId}/environments/{environmentId}/releases/overview?tab=releasePointers";
        }
    }
}
