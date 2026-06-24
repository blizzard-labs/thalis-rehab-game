using UnityEngine;
using UnityEngine.UIElements;

namespace UnityEditor.Tilemaps
{
    internal static class TextUtility
    {
        public static string TruncateWithEllipsis(GUIStyle style, string text, float maxWidth)
        {
            if (string.IsNullOrEmpty(text))
                return text;

            var size = style.CalcSize(GUIContent.Temp(text));
            if (size.x <= maxWidth)
                return text;

            // Binary search for the right length
            int min = 0;
            int max = text.Length;
            string ellipsis = "...";

            while (min < max)
            {
                int mid = (min + max + 1) / 2;
                string truncated = text.Substring(0, mid) + ellipsis;
                size = style.CalcSize(GUIContent.Temp(truncated));

                if (size.x <= maxWidth)
                    min = mid;
                else
                    max = mid - 1;
            }

            return text.Substring(0, min) + ellipsis;
        }
    }
}
