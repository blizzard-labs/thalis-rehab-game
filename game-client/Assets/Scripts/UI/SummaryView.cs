using NeuroReach.App;
using TMPro;
using UnityEngine;

namespace NeuroReach.UI
{
    /// <summary>
    /// Renders SummaryScene (Scenes/README.md §3) from the static
    /// <see cref="SessionStats"/> snapshot captured when the session ended. No
    /// cross-scene object references — the data rides the statics, the same way
    /// IntentScoreBuffer.Shared bridges the socket to the garden.
    /// </summary>
    public class SummaryView : MonoBehaviour
    {
        [Header("Summary fields")]
        [SerializeField] private TextMeshProUGUI focusLine;
        [SerializeField] private TextMeshProUGUI streakLine;
        [SerializeField] private TextMeshProUGUI praiseLine;

        [Tooltip("Press to start another session (back to calibration).")]
        [SerializeField] private KeyCode restartKey = KeyCode.Space;

        private void Start()
        {
            if (focusLine != null) focusLine.text = SessionStats.FocusLine(SessionStats.TotalActiveSeconds);
            if (streakLine != null) streakLine.text = SessionStats.StreakLine(SessionStats.BestStreakSeconds);
            if (praiseLine != null) praiseLine.text = SessionStats.PraiseLine();
        }

        private void Update()
        {
            if (Input.GetKeyDown(restartKey))
                AppScenes.LoadCalibration();
        }
    }
}
