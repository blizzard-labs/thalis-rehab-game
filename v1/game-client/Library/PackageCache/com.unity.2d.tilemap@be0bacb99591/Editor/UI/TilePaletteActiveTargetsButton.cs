using UnityEditor.Toolbars;
using UnityEngine.UIElements;

namespace UnityEditor.Tilemaps
{
    [EditorToolbarElement(k_ToolbarId)]
    internal class TilePaletteActiveTargetsButton : EditorToolbarDropdown
    {
        internal const string k_ToolbarId = "Tile Palette/Active Targets Button";
        private const string k_IconPath = "Packages/com.unity.2d.tilemap/Editor/Icons/Tilemap.ActiveTargetLayers.png";

        public TilePaletteActiveTargetsButton()
        {
            TilePaletteOverlayUtility.SetStyleSheet(this);

            icon = EditorGUIUtility.LoadIcon(k_IconPath);
            clicked += OnClicked;
        }

        private void OnClicked()
        {
            AbstractGenericMenu menu = new TilePaletteActiveTargetsDropdownMenu(true, 0);
            menu.DropDown(worldBound, this, DropdownMenuSizeMode.Fixed);
        }
    }
}
