using UnityEngine.Timeline;
using UnityEngine;
#if UNITY_6000_4_OR_NEWER

using EndNameEditCallback = UnityEditor.ProjectWindowCallback.AssetCreationEndAction;
#else
using EndNameEditCallback = UnityEditor.ProjectWindowCallback.EndNameEditAction;
#endif

namespace UnityEditor.Timeline
{
    abstract class PostNameEditAction : EndNameEditCallback
    {
#if !UNITY_6000_4_OR_NEWER
        public override void Action(int instanceId, string pathName, string resourceFile)
        {
            Action(instanceId, pathName, resourceFile);
        }
#else
        public override void Action(EntityId instanceId, string pathName, string resourceFile)
        {
            Action(instanceId, pathName, resourceFile);
        }
#endif

        protected abstract void Action(ObjectId objectId, string pathName, string resourceFile);
    }
}
