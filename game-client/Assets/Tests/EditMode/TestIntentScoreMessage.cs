using NeuroReach.Scoring;
using NUnit.Framework;

namespace NeuroReach.Tests
{
    public class TestIntentScoreMessage
    {
        [Test]
        public void FromJson_ValidFrame_ParsesAllFields()
        {
            const string json =
                "{\"type\":\"intent_score\",\"intent_score\":72.3,\"erd_score\":68.1," +
                "\"classifier_score\":75.8,\"is_artifact\":false," +
                "\"mode\":\"csp_lda_blend\",\"timestamp\":1234567890.123}";

            var msg = IntentScoreMessage.FromJson(json);

            Assert.IsNotNull(msg);
            Assert.AreEqual(72.3f, msg.IntentScore, 1e-3f);
            Assert.AreEqual(68.1f, msg.ErdScore, 1e-3f);
            Assert.AreEqual(75.8f, msg.ClassifierScore, 1e-3f);
            Assert.IsTrue(msg.HasClassifierScore);
            Assert.IsFalse(msg.IsArtifact);
            Assert.AreEqual("csp_lda_blend", msg.Mode);
            Assert.AreEqual(1234567890.123, msg.Timestamp, 1e-6);
        }

        [Test]
        public void FromJson_NullClassifierScore_UsesSentinel()
        {
            // band_power_only mode sends classifier_score: null.
            const string json =
                "{\"type\":\"intent_score\",\"intent_score\":40.0,\"erd_score\":40.0," +
                "\"classifier_score\":null,\"is_artifact\":true," +
                "\"mode\":\"band_power_only\",\"timestamp\":1.0}";

            var msg = IntentScoreMessage.FromJson(json);

            Assert.IsNotNull(msg);
            Assert.AreEqual(IntentScoreMessage.NoClassifier, msg.ClassifierScore);
            Assert.IsFalse(msg.HasClassifierScore);
            Assert.IsTrue(msg.IsArtifact);
        }

        [Test]
        public void FromJson_MissingClassifierScore_UsesSentinel()
        {
            // Field absent entirely — must not throw, must keep the sentinel.
            const string json =
                "{\"type\":\"intent_score\",\"intent_score\":55.0,\"erd_score\":50.0," +
                "\"is_artifact\":false,\"mode\":\"band_power_only\",\"timestamp\":2.0}";

            var msg = IntentScoreMessage.FromJson(json);

            Assert.IsNotNull(msg);
            Assert.AreEqual(IntentScoreMessage.NoClassifier, msg.ClassifierScore);
            Assert.AreEqual(55.0f, msg.IntentScore, 1e-3f);
        }

        [Test]
        public void FromJson_Malformed_ReturnsNull()
        {
            // Contract: malformed JSON returns null (does not throw).
            Assert.IsNull(IntentScoreMessage.FromJson("{not valid json"));
        }

        [Test]
        public void FromJson_NullOrEmpty_ReturnsNull()
        {
            Assert.IsNull(IntentScoreMessage.FromJson(null));
            Assert.IsNull(IntentScoreMessage.FromJson(""));
            Assert.IsNull(IntentScoreMessage.FromJson("   "));
        }
    }
}
