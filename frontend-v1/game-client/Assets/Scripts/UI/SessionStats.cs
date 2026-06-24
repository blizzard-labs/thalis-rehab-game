using UnityEngine;

namespace NeuroReach.UI
{
    /// <summary>
    /// Static snapshot of a session's positive metrics, decoupled from any scene
    /// object so it survives the Garden → Summary load (mirrors the static-bridge
    /// pattern used by IntentScoreBuffer.Shared). SessionEndTrigger captures into
    /// it; SummaryView reads it. Reset at the start of each session (calibration).
    ///
    /// Language stays warm and non-comparative (spec §9.3 — never a raw percentage
    /// or letter grade). All copy lives here so the in-Garden card and the Summary
    /// scene render identically.
    /// </summary>
    public static class SessionStats
    {
        public static float TotalActiveSeconds;
        public static float BestStreakSeconds;
        public static int TrialsCompleted;

        public static void Reset()
        {
            TotalActiveSeconds = 0f;
            BestStreakSeconds = 0f;
            TrialsCompleted = 0;
        }

        public static void Capture(float totalActiveSeconds, float bestStreakSeconds, int trialsCompleted)
        {
            TotalActiveSeconds = totalActiveSeconds;
            BestStreakSeconds = bestStreakSeconds;
            TrialsCompleted = trialsCompleted;
        }

        public static string FocusLine(float totalActiveSeconds)
        {
            int minutes = Mathf.Max(0, Mathf.RoundToInt(totalActiveSeconds / 60f));
            return minutes == 1
                ? "You focused for 1 minute"
                : $"You focused for {minutes} minutes";
        }

        public static string StreakLine(float bestStreakSeconds)
        {
            int seconds = Mathf.Max(0, Mathf.RoundToInt(bestStreakSeconds));
            return $"Your best streak was {seconds} seconds";
        }

        public static string PraiseLine() => "Great session!";
    }
}
