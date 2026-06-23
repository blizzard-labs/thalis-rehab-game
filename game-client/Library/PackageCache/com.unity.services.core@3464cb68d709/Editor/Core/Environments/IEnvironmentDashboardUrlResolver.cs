using System;

namespace Unity.Services.Core.Editor.Environments
{
    interface IEnvironmentDashboardUrlResolver
    {
        string ManageEnvironments();
        string ManageReleasePointers(Guid environmentId);
    }
}
