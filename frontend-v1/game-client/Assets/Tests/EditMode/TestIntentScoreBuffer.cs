using NeuroReach.Scoring;
using NUnit.Framework;

namespace NeuroReach.Tests
{
    public class TestIntentScoreBuffer
    {
        private static IntentScoreMessage Msg(float intent) =>
            new IntentScoreMessage { IntentScore = intent };

        [Test]
        public void RecentAverage_AlternatingScores_IsAboutFifty()
        {
            var buf = new IntentScoreBuffer(64);
            for (int i = 0; i < 25; i++)
                buf.Add(Msg(i % 2 == 0 ? 80.0f : 20.0f));

            Assert.AreEqual(50.0f, buf.RecentAverage(10), 5.0f);
        }

        [Test]
        public void RecentAverage_FewerThanN_ReturnsZero()
        {
            var buf = new IntentScoreBuffer(64);
            buf.Add(Msg(90f));
            buf.Add(Msg(90f));

            Assert.AreEqual(0f, buf.RecentAverage(10));
        }

        [Test]
        public void StreakAboveThreshold_TenHighFrames_IsTrue()
        {
            var buf = new IntentScoreBuffer(64);
            for (int i = 0; i < 10; i++) buf.Add(Msg(90.0f));

            Assert.IsTrue(buf.StreakAboveThreshold(75.0f, 10));
        }

        [Test]
        public void StreakAboveThreshold_OneLowFrameBreaksIt_IsFalse()
        {
            var buf = new IntentScoreBuffer(64);
            for (int i = 0; i < 9; i++) buf.Add(Msg(90.0f));
            buf.Add(Msg(60.0f));

            Assert.IsFalse(buf.StreakAboveThreshold(75.0f, 10));
        }

        [Test]
        public void Latest_EmptyBuffer_ReturnsNull()
        {
            var buf = new IntentScoreBuffer(64);
            Assert.IsNull(buf.Latest);
        }

        [Test]
        public void Latest_ReturnsMostRecent()
        {
            var buf = new IntentScoreBuffer(64);
            buf.Add(Msg(10f));
            buf.Add(Msg(99f));
            Assert.IsNotNull(buf.Latest);
            Assert.AreEqual(99f, buf.Latest.IntentScore, 1e-3f);
        }

        [Test]
        public void Buffer_WrapsAround_KeepsLastCapacityFrames()
        {
            var buf = new IntentScoreBuffer(4);
            for (int i = 0; i < 10; i++) buf.Add(Msg(i));

            Assert.AreEqual(4, buf.Count);
            Assert.AreEqual(9f, buf.Latest.IntentScore, 1e-3f);
            // Mean of last 4: 6,7,8,9 -> 7.5
            Assert.AreEqual(7.5f, buf.RecentAverage(4), 1e-3f);
        }
    }
}
