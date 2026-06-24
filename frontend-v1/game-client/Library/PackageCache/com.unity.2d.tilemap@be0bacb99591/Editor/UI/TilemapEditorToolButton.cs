using System;
using UnityEditor.EditorTools;
using UnityEditor.ShortcutManagement;
using UnityEditor.Toolbars;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityEditor.Tilemaps
{
    internal class TilemapEditorToolButton : EditorToolbarToggle
    {
        private TilemapEditorTool m_TilemapEditorTool;
        private Type m_TilemapEditorToolType;

        public TilemapEditorToolButton(TilemapEditorTool tool)
        {
            focusable = false;

            if (tool != null)
            {
                name = tool.name;
                icon = tool.toolbarIcon?.image as Texture2D;
                tooltip = tool.toolbarIcon?.tooltip;
                m_TilemapEditorTool = tool;
                m_TilemapEditorToolType = tool.GetType();
            }

            this.RegisterValueChangedCallback((evt) =>
            {
                SetToolActive();
            });

            RegisterCallback<AttachToPanelEvent>(OnAttachedToPanel);
            RegisterCallback<DetachFromPanelEvent>(OnDetachFromPanel);

            UpdateState();
        }

        private void OnAttachedToPanel(AttachToPanelEvent evt)
        {
            ToolManager.activeToolChanged += UpdateState;
            ToolManager.activeContextChanged += UpdateState;
            ShortcutIntegration.instance.profileManager.shortcutBindingChanged += UpdateTooltips;
            UpdateState();
        }

        private void OnDetachFromPanel(DetachFromPanelEvent evt)
        {
            ShortcutIntegration.instance.profileManager.shortcutBindingChanged -= UpdateTooltips;
            ToolManager.activeToolChanged -= UpdateState;
            ToolManager.activeContextChanged -= UpdateState;
        }

        protected void SetToolActive()
        {
            var active = ToolManager.activeToolType;
            if (active == m_TilemapEditorToolType)
                ToolManager.RestorePreviousPersistentTool();
            else
                TilemapEditorTool.SetActiveEditorTool(m_TilemapEditorToolType);
            UpdateState();
        }

        private void UpdateState()
        {
            var activeTool = m_TilemapEditorTool == EditorToolManager.activeTool;
            SetValueWithoutNotify(activeTool);
        }

        private void UpdateTooltips(IShortcutProfileManager arg1, Identifier arg2, ShortcutBinding arg3, ShortcutBinding arg4)
        {
            tooltip = m_TilemapEditorTool != null ? m_TilemapEditorTool.toolbarIcon.tooltip : String.Empty;
        }
    }
}
