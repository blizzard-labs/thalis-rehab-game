using NeuroReach.Garden;
using NUnit.Framework;
using UnityEngine;

namespace NeuroReach.Tests
{
    public class TestPlantGrowthModel
    {
        private const float Dt = 0.02f; // 50 Hz sim step

        private static void Simulate(PlantGrowthModel m, float intent01, float seconds)
        {
            int steps = Mathf.RoundToInt(seconds / Dt);
            for (int i = 0; i < steps; i++)
                m.Update(intent01, Dt);
        }

        [Test]
        public void Growth_FullIntent_ReachesNearOneBeforeFiveSeconds()
        {
            var m = new PlantGrowthModel();
            Simulate(m, 1.0f, 5.0f);
            Assert.GreaterOrEqual(m.CurrentGrowth, 0.99f);
        }

        [Test]
        public void Wilt_IsSlow_DoesNotHitZeroInThreeSeconds()
        {
            var m = new PlantGrowthModel();

            // Grow to ~0.9 (lands slightly above 0.9 on the step that crosses it).
            while (m.CurrentGrowth < 0.9f)
                m.Update(1.0f, Dt);

            Simulate(m, 0.0f, 3.0f); // wilt at 0.3/s
            Assert.Greater(m.CurrentGrowth, 0.0f);
        }

        [Test]
        public void Bloom_Hysteresis_HoldsBetweenOnAndOffThresholds()
        {
            var m = new PlantGrowthModel();

            // Drive above 0.75 and dwell > 3 s to trigger bloom.
            while (m.CurrentGrowth <= 0.75f)
                m.Update(1.0f, Dt);
            Simulate(m, 1.0f, 3.1f);
            Assert.IsTrue(m.IsBloom, "bloom should trigger after dwell above 0.75");

            // Settle at 0.70 (below on-threshold, above off-threshold): bloom holds.
            Simulate(m, 0.70f, 2.0f);
            Assert.AreEqual(0.70f, m.CurrentGrowth, 1e-2f);
            Assert.IsTrue(m.IsBloom, "bloom must hold between 0.60 and 0.75 (hysteresis)");

            // Drop to 0.55 (below off-threshold): bloom clears.
            Simulate(m, 0.55f, 2.0f);
            Assert.AreEqual(0.55f, m.CurrentGrowth, 1e-2f);
            Assert.IsFalse(m.IsBloom, "bloom must clear below 0.60");
        }

        [Test]
        public void CurrentGrowth_AlwaysClampedZeroToOne()
        {
            var m = new PlantGrowthModel();
            float[] inputs = { 5f, -3f, 0.5f, 100f, -100f, 0f, 1f, 0.2f };
            foreach (var x in inputs)
            {
                Simulate(m, x, 1.0f);
                Assert.GreaterOrEqual(m.CurrentGrowth, 0f);
                Assert.LessOrEqual(m.CurrentGrowth, 1f);
            }
        }
    }
}
