using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Unity.Services.Core.Editor
{
    class StatusWindow : EditorWindow
    {
        const string Title = "Unity Services Status";

        UIService UI { get; }
        StatusView StatusView { get; set; }

        StatusWindow()
        {
            UI = new UIService();
            StatusView = new StatusView(UI);
            EditorApplication.playModeStateChanged += _ => Reset();
        }

        [MenuItem("Services/Status", priority = 100000)]
        public static void Open()
        {
            FindOrCreateWindow();
        }

        public static StatusWindow FindOrCreateWindow()
        {
            var existingWindow = Resources.FindObjectsOfTypeAll<StatusWindow>().FirstOrDefault();

            if (existingWindow != null)
            {
                existingWindow.Show();
                existingWindow.Focus();
                return existingWindow;
            }

            var window = CreateInstance<StatusWindow>();
            window.minSize = new Vector2(500, 300);
            window.name = Title;
            window.titleContent.text = Title;
            window.Show();
            return window;
        }

        void OnInspectorUpdate()
        {
            UI.Update();
            StatusView?.Update();
        }

        void Reset()
        {
            StatusView?.Reset();
        }

        void CreateGUI()
        {
            using (UI.Scope(rootVisualElement))
            {
                StatusView.CreateGUI();
            }
        }
    }
}
