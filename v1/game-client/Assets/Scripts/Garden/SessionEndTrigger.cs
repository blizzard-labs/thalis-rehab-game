using NeuroReach.App;
using NeuroReach.UI;
using UnityEngine;

namespace NeuroReach.Garden
{
    /// <summary>
    /// Ends the garden session and transitions to SummaryScene. The intent_score
    /// wire format carries no session_end command yet, so this is the client-side
    /// trigger (Scenes/README.md §2): a keypress, or an optional inactivity-free
    /// wall-clock cap. When the server grows a session_end frame, call
    /// <see cref="EndSession"/> from the frame handler instead.
    /// </summary>
    public class SessionEndTrigger : MonoBehaviour
    {
        [Tooltip("Captures the running totals into SessionStats. Auto-found if left empty.")]
        [SerializeField] private SessionSummaryController sessionSummary;

        [Tooltip("Press to end the session and show the summary.")]
        [SerializeField] private KeyCode endKey = KeyCode.Escape;

        [Tooltip("Auto-end after this many seconds (0 = manual/key only).")]
        [SerializeField] private float autoEndAfterSeconds = 0f;

        private float _elapsed;
        private bool _ended;

        private void Awake()
        {
            if (sessionSummary == null)
                sessionSummary = FindFirstObjectByType<SessionSummaryController>();
        }

        private void Update()
        {
            if (_ended) return;

            _elapsed += Time.deltaTime;

            bool timedOut = autoEndAfterSeconds > 0f && _elapsed >= autoEndAfterSeconds;
            if (Input.GetKeyDown(endKey) || timedOut)
                EndSession();
        }

        /// <summary>Snapshot the session totals and load the summary scene.</summary>
        public void EndSession()
        {
            if (_ended) return;
            _ended = true;

            if (sessionSummary != null)
                sessionSummary.CaptureToSessionStats();

            AppScenes.LoadSummary();
        }
    }
}
