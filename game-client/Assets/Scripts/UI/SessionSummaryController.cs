using NeuroReach.Garden;
using NeuroReach.Scoring;
using TMPro;
using UnityEngine;

namespace NeuroReach.UI
{
    /// <summary>
    /// Accumulates positive, non-comparative session metrics and shows a warm
    /// end-of-session card (spec 9.3 — never a raw percentage or letter grade).
    ///
    /// Subscribes to GardenGrowController.OnFrameApplied. Streak detection reuses
    /// the shared buffer so the metric matches what the player sees bloom.
    /// </summary>
    public class SessionSummaryController : MonoBehaviour
    {
        [Header("Summary fields")]
        [SerializeField] private TextMeshProUGUI focusLine;  // "You focused for X minutes"
        [SerializeField] private TextMeshProUGUI streakLine; // "Your best streak was Y seconds"
        [SerializeField] private TextMeshProUGUI praiseLine; // "Great session!"

        [Header("Streak detection")]
        [SerializeField] private float streakThreshold = 70f;
        [SerializeField] private int streakWindow = 5;
        [Tooltip("Frame rate of the scoring stream (Hz); converts streak frames to seconds.")]
        [SerializeField] private float streamHz = 20f;

        public float TotalActiveSeconds { get; private set; }
        public float BestStreakSeconds { get; private set; }
        public int TrialsCompleted { get; private set; }

        private float _currentStreakSeconds;

        private void OnEnable() => GardenGrowController.OnFrameApplied += OnFrame;
        private void OnDisable() => GardenGrowController.OnFrameApplied -= OnFrame;

        private void OnFrame(IntentScoreMessage latest)
        {
            if (latest == null) return;

            float dt = Time.deltaTime;

            // Active time = clean (non-artifact) time on task.
            if (!latest.IsArtifact)
                TotalActiveSeconds += dt;

            // Longest consecutive run of StreakAboveThreshold(threshold, window).
            if (IntentScoreBuffer.Shared.StreakAboveThreshold(streakThreshold, streakWindow))
            {
                _currentStreakSeconds += dt;
                if (_currentStreakSeconds > BestStreakSeconds)
                    BestStreakSeconds = _currentStreakSeconds;
            }
            else
            {
                _currentStreakSeconds = 0f;
            }
        }

        /// <summary>
        /// Increment once per completed trial. Wired to whatever surfaces the
        /// "mi_window_offset" marker — the current intent_score frame carries no
        /// trial_state, so the marker source (a MarkerMessage type or a marker
        /// frame on the same socket) is still TBD. Public so a marker handler
        /// can call it directly today.
        /// </summary>
        public void RegisterTrialCompleted() => TrialsCompleted++;

        /// <summary>Populate the summary card. Language stays positive and non-comparative.</summary>
        public void ShowSummary()
        {
            int minutes = Mathf.Max(0, Mathf.RoundToInt(TotalActiveSeconds / 60f));
            int streakSecs = Mathf.RoundToInt(BestStreakSeconds);

            if (focusLine != null)
                focusLine.text = minutes == 1
                    ? "You focused for 1 minute"
                    : $"You focused for {minutes} minutes";

            if (streakLine != null)
                streakLine.text = $"Your best streak was {streakSecs} seconds";

            if (praiseLine != null)
                praiseLine.text = "Great session!";
        }
    }
}
