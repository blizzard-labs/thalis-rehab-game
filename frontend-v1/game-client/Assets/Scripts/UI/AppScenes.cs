using UnityEngine.SceneManagement;

namespace NeuroReach.App
{
    /// <summary>
    /// Single source of truth for scene names + the transition helpers used by the
    /// MVP flow (Calibration → Garden → Summary, spec §9 / Scenes/README.md).
    /// Scene names must match the file names added to Build Settings.
    /// </summary>
    public static class AppScenes
    {
        public const string Calibration = "CalibrationScene";
        public const string Garden = "GardenScene";
        public const string Summary = "SummaryScene";

        public static void LoadCalibration() => SceneManager.LoadScene(Calibration);
        public static void LoadGarden() => SceneManager.LoadScene(Garden);
        public static void LoadSummary() => SceneManager.LoadScene(Summary);
    }
}
