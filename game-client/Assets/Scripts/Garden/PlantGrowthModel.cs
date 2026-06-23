using UnityEngine;

namespace NeuroReach.Garden
{
    /// <summary>
    /// Logical growth state of the garden plant, fully decoupled from Unity's
    /// Transform/Animator. Pure C# — the MonoBehaviour (GardenGrowController)
    /// reads CurrentGrowth/IsBloom and applies them to GameObjects.
    ///
    /// Design intent (spec 9.1): growth is rewarding and quick, wilting is slow
    /// and gentle — never a punitive hard reset. Bloom uses a dwell timer plus
    /// hysteresis so it does not flicker on/off at the threshold boundary.
    /// </summary>
    public class PlantGrowthModel
    {
        // Asymmetric rates (per second).
        public const float GrowSpeed = 0.8f;   // toward a higher target
        public const float WiltSpeed = 0.3f;   // toward a lower target

        // Bloom thresholds + dwell.
        public const float BloomOnGrowth = 0.75f;     // must exceed to start counting
        public const float BloomOffGrowth = 0.60f;    // drop below to clear bloom (hysteresis)
        public const float BloomDwellSeconds = 3.0f;  // accumulated time above BloomOnGrowth

        public float CurrentGrowth { get; private set; }
        public float TargetGrowth { get; private set; }
        public bool IsBloom { get; private set; }

        // Accumulated seconds spent above BloomOnGrowth (resets when we fall below it,
        // pre-bloom, or when bloom is cleared below BloomOffGrowth).
        private float _aboveTime;

        /// <summary>
        /// Advance the model one tick.
        /// </summary>
        /// <param name="intentScore01">Desired growth in [0,1] (intent score / 100).</param>
        /// <param name="deltaTime">Elapsed seconds since the last call.</param>
        public void Update(float intentScore01, float deltaTime)
        {
            TargetGrowth = Mathf.Clamp01(intentScore01);

            float speed = (TargetGrowth > CurrentGrowth) ? GrowSpeed : WiltSpeed;
            float step = speed * Mathf.Max(0f, deltaTime);

            float delta = TargetGrowth - CurrentGrowth;
            if (Mathf.Abs(delta) <= step)
                CurrentGrowth = TargetGrowth;
            else
                CurrentGrowth += Mathf.Sign(delta) * step;

            CurrentGrowth = Mathf.Clamp01(CurrentGrowth);

            UpdateBloom(deltaTime);
        }

        private void UpdateBloom(float deltaTime)
        {
            if (CurrentGrowth > BloomOnGrowth)
            {
                _aboveTime += Mathf.Max(0f, deltaTime);
                if (_aboveTime >= BloomDwellSeconds)
                    IsBloom = true;
            }
            else
            {
                // Below the on-threshold: stop accumulating dwell. Existing bloom
                // is held (hysteresis) until we fall under BloomOffGrowth.
                _aboveTime = 0f;
            }

            if (CurrentGrowth < BloomOffGrowth)
            {
                IsBloom = false;
                _aboveTime = 0f;
            }
        }

        /// <summary>Reset to seed state (e.g. new trial / new session).</summary>
        public void Reset()
        {
            CurrentGrowth = 0f;
            TargetGrowth = 0f;
            IsBloom = false;
            _aboveTime = 0f;
        }
    }
}
