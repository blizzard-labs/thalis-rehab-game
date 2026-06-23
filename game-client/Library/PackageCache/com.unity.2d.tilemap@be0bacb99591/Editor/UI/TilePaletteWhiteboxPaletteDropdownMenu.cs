using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityEditor.Tilemaps
{
    internal class TilePaletteWhiteboxPaletteDropdownMenu : AbstractGenericMenu
    {
        private const float k_DropdownWidth = 156f;

        private GridPaletteWhiteboxPalettesDropdown m_Dropdown;

        private Action m_OnClose;

        public TilePaletteWhiteboxPaletteDropdownMenu(Action onClose)
        {
            int index = -1;
            var menuData = new GridPaletteWhiteboxPalettesDropdown.MenuItemProvider();
            m_Dropdown = new GridPaletteWhiteboxPalettesDropdown(menuData, index, null, SelectWhiteboxPalette, k_DropdownWidth);
            m_OnClose = onClose;
        }

        public override void AddItem(string itemName, bool isChecked, System.Action action)
        {
        }

        public override void AddItem(string itemName, bool isChecked, System.Action<object> action, object data)
        {
        }

        public override void AddDisabledItem(string itemName, bool isChecked)
        {
        }

        public override void AddSeparator(string path)
        {
        }

        public override void DropDown(Rect position, VisualElement targetElement, DropdownMenuSizeMode dropdownMenuSizeMode)
        {
            PopupWindow.Show(position, m_Dropdown, null, ShowMode.PopupMenu);
        }

        public void Close()
        {
            PopupWindow.Show(default, m_Dropdown, null, ShowMode.PopupMenu);
        }

        private void SelectWhiteboxPalette(int i, object o)
        {
            m_Dropdown.editorWindow.Close();
            m_OnClose?.Invoke();

            var paletteCount = GridPalettes.palettes.Count;
            TilePaletteWhiteboxSamplesUtility.DuplicateWhiteboxSample(i);
            if (paletteCount > 0 && GridPaintPaletteClipboard.instances is { Count: > 0 })
            {
                var clipboard = GridPaintPaletteClipboard.instances[0];
                clipboard.PickFirstFromPalette();
            }
        }
    }
}
