using System;
using Newtonsoft.Json;

namespace NeuroReach.Scoring
{
    /// <summary>
    /// One scoring frame broadcast by the Python NeuroReachWSServer over
    /// ws://localhost:8765. Pure data — not a MonoBehaviour.
    ///
    /// Server wire format (snake_case), see signal-engine/server/ws_server.py:
    ///   {"type": "intent_score", "intent_score": 72.3, "erd_score": 68.1,
    ///    "classifier_score": 75.8 | null, "is_artifact": false,
    ///    "mode": "band_power_only" | "csp_lda_blend", "timestamp": 1234567890.123}
    ///
    /// We map snake_case JSON -> PascalCase C# fields with Newtonsoft
    /// [JsonProperty] because Unity's JsonUtility cannot remap field names.
    /// </summary>
    [Serializable]
    public class IntentScoreMessage
    {
        /// <summary>Sentinel used when the server omits / nulls classifier_score.</summary>
        public const float NoClassifier = -1f;

        [JsonProperty("intent_score")] public float IntentScore;
        [JsonProperty("erd_score")] public float ErdScore;

        // classifier_score is nullable on the wire (null in band_power_only mode).
        // NullValueHandling.Ignore leaves this at the -1 sentinel when null/absent.
        [JsonProperty("classifier_score")] public float ClassifierScore = NoClassifier;

        [JsonProperty("is_artifact")] public bool IsArtifact;
        [JsonProperty("mode")] public string Mode;
        [JsonProperty("timestamp")] public double Timestamp;

        /// <summary>True when the server supplied a real classifier score this frame.</summary>
        [JsonIgnore] public bool HasClassifierScore => ClassifierScore >= 0f;

        private static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            // null classifier_score -> keep field default (NoClassifier sentinel).
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore,
        };

        /// <summary>
        /// Parse a server JSON frame. Behavior contract:
        ///  - null / empty / whitespace  -> returns null
        ///  - malformed JSON             -> returns null (does NOT throw)
        ///  - missing classifier_score   -> ClassifierScore == NoClassifier (-1)
        /// Caller must null-check the result.
        /// </summary>
        public static IntentScoreMessage FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;

            try
            {
                return JsonConvert.DeserializeObject<IntentScoreMessage>(json, Settings);
            }
            catch (JsonException)
            {
                // Malformed payload — swallow and signal failure via null so the
                // networking layer can drop the frame instead of crashing.
                return null;
            }
        }
    }
}
