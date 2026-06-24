using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityEditor.Tilemaps
{
    /// <summary>
    /// Popup Field for selecting the Active Brush for Grid Painting.
    /// </summary>
    [UxmlElement]
    public sealed partial class TilePaletteBrushesPopup : PopupField<GridBrushBase>
    {
        private static string k_NullGameObjectName = L10n.Tr("No Valid Brush");

        private static string k_LabelTooltip =
            L10n.Tr("Specifies the currently active Brush used for painting in the Scene View.");

        /// <summary>
        /// Factory for TilePaletteBrushesPopup.
        /// </summary>
        [Obsolete("TilePaletteBrushesPopupFactory is deprecated and will be removed. Use UxmlElementAttribute instead.", false)]
        public class TilePaletteBrushesPopupFactory : UxmlFactory<TilePaletteBrushesPopup, TilePaletteBrushesPopupUxmlTraits> {}
        /// <summary>
        /// UxmlTraits for TilePaletteBrushesPopup.
        /// </summary>
        [Obsolete("TilePaletteBrushesPopupUxmlTraits is deprecated and will be removed. Use UxmlElementAttribute instead.", false)]
        public class TilePaletteBrushesPopupUxmlTraits : UxmlTraits {}

        /// <summary>
        /// USS class name of elements of this type.
        /// </summary>
        private new static readonly string ussClassName = "unity-tilepalette-brushes-field";
        /// <summary>
        /// USS class name of labels in elements of this type.
        /// </summary>
        private new static readonly string labelUssClassName = ussClassName + "__label";
        /// <summary>
        /// USS class name of input elements in elements of this type.
        /// </summary>
        private new static readonly string inputUssClassName = ussClassName + "__input";

        private bool m_Active;

        /// <summary>
        /// Initializes and returns an instance of TilePaletteBrushesPopup.
        /// </summary>
        public TilePaletteBrushesPopup() : this(null) {}

        /// <summary>
        /// Initializes and returns an instance of TilePaletteBrushesPopup.
        /// </summary>
        /// <param name="label">Label name for the Popup</param>
        public TilePaletteBrushesPopup(string label)
            : base(label, new List<GridBrushBase>(GridPaintingState.brushes), GetBrushIndex())
        {
            AddToClassList(ussClassName);
            labelElement.AddToClassList(labelUssClassName);
            visualInput.AddToClassList(inputUssClassName);

            TilePaletteOverlayUtility.SetStyleSheet(this);
            labelElement.tooltip = k_LabelTooltip;

            RegisterCallback<AttachToPanelEvent>(OnAttachedToPanel);
            RegisterCallback<DetachFromPanelEvent>(OnDetachFromPanel);
            RegisterCallback<PointerDownEvent>(OnPointerDown);

            m_FormatSelectedValueCallback += FormatSelectedValueCallback;
            createMenuCallback += CreateMenuCallback;

            SetValueWithoutNotify(GridPaintingState.gridBrush);
        }

        private void OnPointerDown(PointerDownEvent evt)
        {
            m_Active = true;
            ShowMenu();
            m_Active = false;
        }

        private void OnAttachedToPanel(AttachToPanelEvent evt)
        {
            GridPaintingState.brushChanged += OnBrushChanged;
            SetValueWithoutNotify(GridPaintingState.gridBrush);
        }

        private void OnBrushChanged(GridBrushBase obj)
        {
            if (obj == null)
                return;
            choices = new List<GridBrushBase>(GridPaintingState.brushes);
            UpdateBrush();
        }

        private void OnDetachFromPanel(DetachFromPanelEvent evt)
        {
            GridPaintingState.brushChanged -= OnBrushChanged;
        }

        private string FormatSelectedValueCallback(GridBrushBase brush)
        {
            if (brush != null)
                return brush.name;
            return k_NullGameObjectName;
        }

        private AbstractGenericMenu CreateMenuCallback()
        {
            return new TilePaletteBrushesDropdownMenu(m_Active, Mathf.FloorToInt(resolvedStyle.width));
        }

        private static int GetBrushIndex()
        {
            return GridPaintingState.brushes.IndexOf(GridPaintingState.gridBrush);
        }

        private void UpdateBrush()
        {
            index = GetBrushIndex();
        }
    }
}
