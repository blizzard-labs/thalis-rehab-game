using System;
using Newtonsoft.Json;
using Unity.Services.Core.Editor.Settings;
using Unity.Services.Core.Internal.Serialization;

namespace Unity.Services.Core.Editor.Environments.Save
{
    class EnvironmentSaveSystem : IEnvironmentSaveSystem
    {
        const string k_SettingsPath = "ProjectSettings/Packages/com.unity.services.core/Settings.json";

        readonly IFileSystem m_FileSystem;
        readonly IJsonSerializer m_JsonSerializer;

        SettingsFile m_CachedSettings;
        bool m_IsDirty = true;

        public EnvironmentSaveSystem(IFileSystem fileSystem)
        {
            m_FileSystem = fileSystem;
            m_JsonSerializer = new NewtonsoftSerializer(
                new JsonSerializerSettings()
                {
                    Formatting = Formatting.Indented
                });
        }

        public void SaveEnvironment(EnvironmentSettings settings)
        {
            ReloadIfDirty();
            m_CachedSettings.EnvironmentName = settings.EnvironmentName;
            m_CachedSettings.EnvironmentId = settings.EnvironmentId;
            m_FileSystem.SaveFile(k_SettingsPath, m_JsonSerializer.SerializeObject(m_CachedSettings));
        }

        public EnvironmentSettings LoadEnvironment()
        {
            ReloadIfDirty();

            // Sanitize in case we are in the upgrade path where an old settings.json
            // is being accessed and has only the environment name field:
            if (!string.IsNullOrEmpty(m_CachedSettings.EnvironmentName) && m_CachedSettings.EnvironmentId == Guid.Empty)
            {
                // here we have a problem: if we want to return the environment id associated to this
                // environment name, we need to perform a query which takes time and shouldn't be done synchronously in a getter.
                // the lesser evil is to reset the current config and pretend the environment is not setup.
                SaveEnvironment(new EnvironmentSettings());
            }

            return new EnvironmentSettings(m_CachedSettings.EnvironmentName, m_CachedSettings.EnvironmentId);
        }


        void ReloadIfDirty()
        {
            if (!m_IsDirty)
                return;

            var fileContent = m_FileSystem.GetFileContent(k_SettingsPath);
            m_CachedSettings = !string.IsNullOrEmpty(fileContent)
                ? m_JsonSerializer.DeserializeObject<SettingsFile>(fileContent) ?? new SettingsFile()
                : new SettingsFile();
            m_IsDirty = false;
        }

        class SettingsFile
        {
            public string EnvironmentName { get; set; } = string.Empty;
            public Guid EnvironmentId { get; set; } = Guid.Empty;
        }
    }
}
