using System;
using Unity.Services.Core.Device.Internal;
using UnityEngine;

namespace Unity.Services.Core.Device
{
    class EngineInstallationId : IEngineInstallationId
    {
        const string k_UnityEngineInstallationIdKey = "unity_connect.installation_id";

        internal string Identifier;

        public string GetOrCreateIdentifier()
        {
#if ENABLE_UNITY_CLOUD_IDENTIFIERS
            return UnityEngine.Identifiers.Identifiers.installationId;
#else
            if (string.IsNullOrEmpty(Identifier))
            {
                CreateIdentifier();
            }

            return Identifier;
#endif
        }

        public void CreateIdentifier()
        {
            Identifier = ReadIdentifierFromFile();
            if (!string.IsNullOrEmpty(Identifier))
            {
                return;
            }

            Identifier = GenerateGuid();
            WriteIdentifierToFile(Identifier);
        }

        static string ReadIdentifierFromFile()
        {
            return PlayerPrefs.GetString(k_UnityEngineInstallationIdKey);
        }

        static void WriteIdentifierToFile(string identifier)
        {
            PlayerPrefs.SetString(k_UnityEngineInstallationIdKey, identifier);
            PlayerPrefs.Save();
        }

        static string GenerateGuid()
        {
            return Guid.NewGuid().ToString();
        }
    }
}
