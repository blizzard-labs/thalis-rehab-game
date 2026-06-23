using JetBrains.Annotations;
using UnityEngine;
using UnityEngine.Timeline;

namespace UnityEditor.Timeline.Signals
{
    [CustomEditor(typeof(SignalAsset))]
    class SignalAssetInspector : Editor
    {
        [MenuItem("Assets/Create/Timeline/Signal", false, -124)]
        [UsedImplicitly]
        public static void CreateNewSignal()
        {
            var icon = EditorGUIUtility.IconContent("SignalAsset Icon").image as Texture2D;
            ProjectWindowUtil.StartNameEditingIfProjectWindowExists(ObjectId.InvalidId, CreateInstance<DoCreateSignalAsset>(), "New Signal.signal", icon, null);
        }

        class DoCreateSignalAsset : PostNameEditAction
        {
            protected override void Action(ObjectId objectId, string pathName, string resourceFile)
            {
                var signalAsset = CreateInstance<SignalAsset>();
                AssetDatabase.CreateAsset(signalAsset, pathName);
                ProjectWindowUtil.ShowCreatedAsset(signalAsset);
            }
        }
    }
}
