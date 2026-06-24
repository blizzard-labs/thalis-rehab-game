using System;
using NeuroReach.Scoring;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace NeuroReach.Garden
{
    /// <summary>
    /// Drives the garden plant from the shared IntentScoreBuffer. Thin wrapper:
    /// all growth logic lives in <see cref="PlantGrowthModel"/>; this class only
    /// reads the latest frame and applies the model to GameObjects.
    /// </summary>
    public class GardenGrowController : MonoBehaviour
    {
        [Header("Scene references")]
        [SerializeField] private Transform plantTransform;
        [SerializeField] private ParticleSystem bloomParticles;
        [SerializeField] private Slider historySlider;       // RecentAverage(20), 1 s running avg
        [SerializeField] private TextMeshProUGUI statusText; // "Rest" / "Imagine now!" / status

        [Header("Scale mapping")]
        [SerializeField] private float minScale = 0.3f; // never fully disappears
        [SerializeField] private float maxScale = 1.5f;

        /// <summary>
        /// Fired once per frame after the model is applied, carrying the frame the
        /// controller just processed. SessionSummaryController subscribes to this.
        /// </summary>
        public static event Action<IntentScoreMessage> OnFrameApplied;

        private readonly PlantGrowthModel _model = new PlantGrowthModel();

        public PlantGrowthModel Model => _model;

        private void Awake()
        {
            // _model already constructed; nothing else required.
        }

        private void Update()
        {
            var latest = IntentScoreBuffer.Shared.Latest;
            float intent01 = latest != null ? latest.IntentScore / 100f : 0f;

            _model.Update(intent01, Time.deltaTime);

            if (plantTransform != null)
                plantTransform.localScale =
                    Vector3.one * Mathf.Lerp(minScale, maxScale, _model.CurrentGrowth);

            if (bloomParticles != null)
            {
                if (_model.IsBloom && !bloomParticles.isPlaying) bloomParticles.Play();
                else if (!_model.IsBloom && bloomParticles.isPlaying) bloomParticles.Stop();
            }

            if (historySlider != null)
                historySlider.value = IntentScoreBuffer.Shared.RecentAverage(20) / 100f;

            if (statusText != null)
                statusText.text = BuildStatus(latest);

            OnFrameApplied?.Invoke(latest);
        }

        private static string BuildStatus(IntentScoreMessage latest)
        {
            if (latest == null) return Networking_ConnectionStatus();
            if (latest.IsArtifact) return "⚡ Signal check...";
            if (latest.Mode == "band_power_only") return "Focus...";
            return "";
        }

        // Kept indirection-free to avoid a hard asmdef dependency on Networking:
        // the connection status is surfaced through the buffer being empty.
        private static string Networking_ConnectionStatus() => "Connecting...";
    }
}
