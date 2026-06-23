using UnityEditor;

namespace Unity.Services.Core.Components.Editor
{
    class ServicesInitializationEditor
    {
        const string EnableAdvancedFeaturesContext = "CONTEXT/ServicesBehaviour/Show Advanced Features";
        const string HideAdvancedFeaturesContext = "CONTEXT/ServicesBehaviour/Hide Advanced Features";

        [MenuItem(EnableAdvancedFeaturesContext, false, 1001)]
        static void ShowAdvancedFeatures(MenuCommand cmd)
        {
            (cmd.context as ServicesBehaviour).ShowAdvancedFeatures = true;
        }

        [MenuItem(HideAdvancedFeaturesContext, false, 1002)]
        static void HideAdvancedFeatures(MenuCommand cmd)
        {
            (cmd.context as ServicesBehaviour).ShowAdvancedFeatures = false;
        }

        [MenuItem(EnableAdvancedFeaturesContext, true)]
        static bool IsShowAdvancedFeaturesEnabled(MenuCommand cmd)
        {
            return !(cmd.context as ServicesBehaviour).ShowAdvancedFeatures;
        }

        [MenuItem(HideAdvancedFeaturesContext, true)]
        static bool IsHideAdvancedFeaturesEnabled(MenuCommand cmd)
        {
            return (cmd.context as ServicesBehaviour).ShowAdvancedFeatures;
        }

        [MenuItem("CONTEXT/ServicesInitialization/Open Services Settings", false, 2003)]
        static void OpenServicesSettings(MenuCommand _)
        {
            SettingsService.OpenProjectSettings("Project/Services");
        }

        [MenuItem("CONTEXT/ServicesInitialization/Open Environment Settings", false, 2004)]
        static void OpenEnvironmentSettings(MenuCommand _)
        {
            SettingsService.OpenProjectSettings("Project/Services/Environments");
        }
    }
}
