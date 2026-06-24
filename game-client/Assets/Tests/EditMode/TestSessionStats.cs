using NeuroReach.UI;
using NUnit.Framework;

namespace NeuroReach.Tests
{
    public class TestSessionStats
    {
        [Test]
        public void FocusLine_Singular_UsesMinuteNotMinutes()
        {
            // 90 s rounds to 2 min, 30 s rounds to 1 min — check the singular path.
            Assert.AreEqual("You focused for 1 minute", SessionStats.FocusLine(30f));
            Assert.AreEqual("You focused for 1 minute", SessionStats.FocusLine(89f));
        }

        [Test]
        public void FocusLine_Plural_AndZero()
        {
            Assert.AreEqual("You focused for 0 minutes", SessionStats.FocusLine(0f));
            Assert.AreEqual("You focused for 2 minutes", SessionStats.FocusLine(120f));
        }

        [Test]
        public void StreakLine_RoundsAndClampsNonNegative()
        {
            Assert.AreEqual("Your best streak was 6 seconds", SessionStats.StreakLine(6.4f));
            Assert.AreEqual("Your best streak was 7 seconds", SessionStats.StreakLine(6.6f));
            Assert.AreEqual("Your best streak was 0 seconds", SessionStats.StreakLine(-5f));
        }

        [Test]
        public void Praise_IsPositiveAndNonComparative()
        {
            // Spec §9.3: no raw percentage / letter grade.
            string praise = SessionStats.PraiseLine();
            Assert.AreEqual("Great session!", praise);
            StringAssert.DoesNotContain("%", praise);
        }

        [Test]
        public void CaptureThenReset_RoundTrips()
        {
            SessionStats.Capture(42f, 7f, 3);
            Assert.AreEqual(42f, SessionStats.TotalActiveSeconds);
            Assert.AreEqual(7f, SessionStats.BestStreakSeconds);
            Assert.AreEqual(3, SessionStats.TrialsCompleted);

            SessionStats.Reset();
            Assert.AreEqual(0f, SessionStats.TotalActiveSeconds);
            Assert.AreEqual(0f, SessionStats.BestStreakSeconds);
            Assert.AreEqual(0, SessionStats.TrialsCompleted);
        }
    }
}
