using NeuroReach.App;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace NeuroReach.UI
{
    /// <summary>
    /// Drives CalibrationScene (Scenes/README.md §1). The current intent_score wire
    /// format carries no trial/marker field, so real calibration progress can't be
    /// driven from the server yet — this is the client-side placeholder: a calm
    /// "getting set up" screen with a timed progress bar that advances to GardenScene.
    ///
    /// When the server grows a MarkerMessage frame, replace <see cref="Update"/>'s
    /// timer with a trial-counter fed from those markers; the scene wiring is unchanged.
    /// </summary>
    public class CalibrationController : MonoBehaviour
    {
        [Header("Scene references")]
        [SerializeField] private Slider progressBar;
        [SerializeField] private TextMeshProUGUI statusText;

        [Header("Placeholder timing")]
        [Tooltip("Seconds the placeholder calibration screen runs before loading the garden.")]
        [SerializeField] private float calibrationSeconds = 8f;

        [Tooltip("Press to skip straight to the garden.")]
        [SerializeField] private KeyCode skipKey = KeyCode.Space;

        private float _elapsed;
        private bool _advanced;

        private void Start()
        {
            // New session begins here — clear last session's totals.
            SessionStats.Reset();
            _elapsed = 0f;
            _advanced = false;
            if (statusText != null) statusText.text = "Calibration in progress…";
            if (progressBar != null) progressBar.value = 0f;
        }

        private void Update()
        {
            if (_advanced) return;

            _elapsed += Time.deltaTime;
            float t = calibrationSeconds > 0f ? Mathf.Clamp01(_elapsed / calibrationSeconds) : 1f;

            if (progressBar != null) progressBar.value = t;

            if (t >= 1f || Input.GetKeyDown(skipKey))
            {
                _advanced = true;
                if (statusText != null) statusText.text = "Ready!";
                AppScenes.LoadGarden();
            }
        }
    }
}
