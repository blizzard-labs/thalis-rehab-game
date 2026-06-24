using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;



#if ENABLE_VR || ENABLE_AR
using UnityEngine.XR;

namespace UnityEditor.XR.LegacyInputHelpers
{

    public enum UserRequestedTrackingMode
    {
        Default,
        Device,
        Floor,
    }

    [AddComponentMenu("XR/Camera Offset")]
    public class CameraOffset : MonoBehaviour
    {

        const float k_DefaultCameraYOffset = 1.36144f;

        [SerializeField]
        [Tooltip("GameObject to move to desired height off the floor (defaults to this object if none provided).")]
        GameObject m_CameraFloorOffsetObject = null;
        /// <summary>Gets or sets the GameObject to move to desired height off the floor (defaults to this object if none provided).</summary>
        public GameObject cameraFloorOffsetObject { get { return m_CameraFloorOffsetObject; } set { m_CameraFloorOffsetObject = value; UpdateTrackingOrigin(m_TrackingOriginMode); } }

        [SerializeField]
        [Tooltip("What the user wants the tracking origin mode to be")]
        UserRequestedTrackingMode m_RequestedTrackingMode = UserRequestedTrackingMode.Default;
        public UserRequestedTrackingMode requestedTrackingMode { get { return m_RequestedTrackingMode; } set { m_RequestedTrackingMode = value; TryInitializeCamera(); } }

        [SerializeField]
        [Tooltip("Sets the type of tracking origin to use for this Rig. Tracking origins identify where 0,0,0 is in the world of tracking.")]
        TrackingOriginModeFlags m_TrackingOriginMode = TrackingOriginModeFlags.Unknown;
        /// <summary>Gets or sets the type of tracking origin to use for this Rig. Tracking origins identify where 0,0,0 is in the world of tracking. Not all devices support all tracking spaces; if the selected tracking space is not set it will fall back to Stationary.</summary>
        public TrackingOriginModeFlags TrackingOriginMode { get { return m_TrackingOriginMode; } set { m_TrackingOriginMode = value; TryInitializeCamera(); } }

        [SerializeField]
        [Tooltip("Camera Height to be used when in Device tracking space.")]
        float m_CameraYOffset = k_DefaultCameraYOffset;
        /// <summary>Gets or sets the amount the camera is offset from the floor (by moving the camera offset object).</summary>
        public float cameraYOffset { get { return m_CameraYOffset; } set { m_CameraYOffset = value; UpdateTrackingOrigin(m_TrackingOriginMode); } }

        // Bookkeeping to track lazy initialization of the tracking space type.
        bool m_CameraInitialized = false;
        bool m_CameraInitializing = false;

        /// <summary>
        /// Used to cache the input subsystems without creating additional garbage.
        /// </summary>
        static readonly List<XRInputSubsystem> s_InputSubsystems = new List<XRInputSubsystem>();

        void Awake()
        {
            if (!m_CameraFloorOffsetObject)
            {
                Debug.LogWarning("No camera container specified for XR Rig, using attached GameObject");
                m_CameraFloorOffsetObject = this.gameObject;
            }
        }

        void Start()
        {
            TryInitializeCamera();
        }

        void OnValidate()
        {
            TryInitializeCamera();
        }

        void TryInitializeCamera()
        {

            m_CameraInitialized = SetupCamera();
            if (!m_CameraInitialized & !m_CameraInitializing)
                StartCoroutine(RepeatInitializeCamera());
        }

        /// <summary>
        /// Repeatedly attempt to initialize the camera.
        /// </summary>
        /// <returns></returns>
        IEnumerator RepeatInitializeCamera()
        {
            m_CameraInitializing = true;
            yield return null;
            while (!m_CameraInitialized)
            {
                m_CameraInitialized = SetupCamera();
                yield return null;
            }
            m_CameraInitializing = false;
        }

        /// <summary>
        /// Handles re-centering and off-setting the camera in space depending on which tracking space it is setup in.
        /// </summary>
        bool SetupCamera()
        {
            SubsystemManager.GetInstances<XRInputSubsystem>(s_InputSubsystems);

            bool initialized = true;
            if (s_InputSubsystems.Count != 0)
            {
                for (int i = 0; i < s_InputSubsystems.Count; i++)
                {
                    var result = SetupCamera(s_InputSubsystems[i]);

                    // After the camera is successfully set up register the callback for
                    // handing tracking origin changes.  It is possible this could happen more than
                    // once so unregister the callback first just in case.
                    if (result)
                    {
                        s_InputSubsystems[i].trackingOriginUpdated -= OnTrackingOriginUpdated;
                        s_InputSubsystems[i].trackingOriginUpdated += OnTrackingOriginUpdated;
                    }

                    initialized &= result;
                }
            }

            return initialized;
        }

        bool SetupCamera(XRInputSubsystem subsystem)
        {
            if (subsystem == null)
                return false;

            bool trackingSettingsSet = false;

            var currentMode = subsystem.GetTrackingOriginMode();
            var supportedModes = subsystem.GetSupportedTrackingOriginModes();
            TrackingOriginModeFlags requestedMode = TrackingOriginModeFlags.Unknown;

            // map between the user requested options, and the actual options.
            if (m_RequestedTrackingMode == UserRequestedTrackingMode.Default)
            {
                requestedMode = currentMode;
            }
            else if(m_RequestedTrackingMode == UserRequestedTrackingMode.Device)
            {
                requestedMode = TrackingOriginModeFlags.Device;
            }
            else if (m_RequestedTrackingMode == UserRequestedTrackingMode.Floor)
            {
                requestedMode = TrackingOriginModeFlags.Floor;
            }
            else
            {
                Debug.LogWarning("Unknown Requested Tracking Mode");
            }

            // now we've mapped em. actually go set em.
            if (requestedMode == TrackingOriginModeFlags.Floor)
            {
                // We need to check for Unknown because we may not be in a state where we can read this data yet.
                if ((supportedModes & (TrackingOriginModeFlags.Floor | TrackingOriginModeFlags.Unknown)) == 0)
                    Debug.LogWarning("CameraOffset.SetupCamera: Attempting to set the tracking space to Floor, but that is not supported by the SDK.");
                else
                    trackingSettingsSet = subsystem.TrySetTrackingOriginMode(requestedMode);
            }
            else if (requestedMode == TrackingOriginModeFlags.Device)
            {
                // We need to check for Unknown because we may not be in a state where we can read this data yet.
                if ((supportedModes & (TrackingOriginModeFlags.Device | TrackingOriginModeFlags.Unknown)) == 0)
                    Debug.LogWarning("CameraOffset.SetupCamera: Attempting to set the tracking space to Device, but that is not supported by the SDK.");
                else
                    trackingSettingsSet = subsystem.TrySetTrackingOriginMode(requestedMode) && subsystem.TryRecenter();
            }

            if(trackingSettingsSet)
                UpdateTrackingOrigin(subsystem.GetTrackingOriginMode());

            return trackingSettingsSet;
        }

        private void UpdateTrackingOrigin(TrackingOriginModeFlags trackingOriginModeFlags)
        {
            m_TrackingOriginMode = trackingOriginModeFlags;

            if (m_CameraFloorOffsetObject != null)
                m_CameraFloorOffsetObject.transform.localPosition = new Vector3(
                    m_CameraFloorOffsetObject.transform.localPosition.x,
                    m_TrackingOriginMode == TrackingOriginModeFlags.Device ? cameraYOffset : 0.0f,
                    m_CameraFloorOffsetObject.transform.localPosition.z);
        }

        private void OnTrackingOriginUpdated(XRInputSubsystem subsystem) => UpdateTrackingOrigin(subsystem.GetTrackingOriginMode());

        private void OnDestroy()
        {
            SubsystemManager.GetInstances(s_InputSubsystems);
            foreach (var subsystem in s_InputSubsystems)
                subsystem.trackingOriginUpdated -= OnTrackingOriginUpdated;
        }

    }
}

#endif
