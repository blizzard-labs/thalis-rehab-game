#if UNITY_6000_3_OR_NEWER
using UnityEditor;
using UnityEditor.Toolbars;
using UnityEngine;

namespace Unity.Services.Core.Editor.Environments.UI
{
    static class EnvironmentToolbar
    {
        const string k_EnvironmentDropdownElement = "Services/Environment";
        const string k_DefaultLabel = "[No Environment]";
        const string k_ProjectSettingsPath = "Project/Services/Environments";
        const string k_Tooltip = "Select the active environment";
        const string k_Icon = "d_CloudConnect";

        static IEnvironmentsApi EnvironmentsApi => Environments.EnvironmentsApi.Instance;

        [MainToolbarElement(k_EnvironmentDropdownElement, defaultDockPosition = MainToolbarDockPosition.Right)]
        static MainToolbarElement EnableEnvironmentDropdown()
        {
            EnvironmentsApi.PropertyChanged -= OnPropertyChanged;
            EnvironmentsApi.PropertyChanged += OnPropertyChanged;

            var icon = EditorGUIUtility.IconContent(k_Icon).image as Texture2D;
            var environmentLabel = !string.IsNullOrEmpty(EnvironmentsApi.ActiveEnvironmentName) ? EnvironmentsApi.ActiveEnvironmentName : k_DefaultLabel;
            var content = new MainToolbarContent(environmentLabel, icon, k_Tooltip);
            return new MainToolbarButton(content, OpenProjectSettings);
        }

        private static void OpenProjectSettings()
        {
            SettingsService.OpenProjectSettings(k_ProjectSettingsPath);
        }

        private static void OnPropertyChanged(object sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            RefreshToolbar();
        }

        private static void RefreshToolbar()
        {
            MainToolbar.Refresh(k_EnvironmentDropdownElement);
        }
    }
}
#endif
