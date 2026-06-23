using System;
using System.Collections;
using System.Text;
using NativeWebSocket;
using NeuroReach.Scoring;
using UnityEngine;

namespace NeuroReach.Networking
{
    /// <summary>
    /// Thin MonoBehaviour wrapper around NativeWebSocket. Connects to the Python
    /// NeuroReachWSServer, parses inbound intent_score frames into
    /// <see cref="IntentScoreMessage"/>, and pushes them onto the shared
    /// <see cref="IntentScoreBuffer"/> that GardenGrowController reads.
    ///
    /// All real logic lives in the pure classes; this class only marshals bytes,
    /// the Unity lifecycle, and reconnection.
    /// </summary>
    public class NeuroReachClient : MonoBehaviour
    {
        [Tooltip("WebSocket endpoint of the Python scoring server.")]
        [SerializeField] private string serverUrl = "ws://localhost:8765";

        [Tooltip("Seconds between reconnect attempts after a drop.")]
        [SerializeField] private float reconnectDelaySeconds = 5f;

        [Tooltip("Give up after this many consecutive failed reconnects.")]
        [SerializeField] private int maxReconnectAttempts = 10;

        /// <summary>Human-readable status the UI can poll each frame.</summary>
        public static string ConnectionStatus { get; private set; } = "Idle";

        private WebSocket _ws;
        private int _reconnectAttempts;
        private bool _intentionalClose;
        private Coroutine _reconnectRoutine;

        private async void Start()
        {
            await Connect();
        }

        private async System.Threading.Tasks.Task Connect()
        {
            ConnectionStatus = "Connecting...";
            _ws = new WebSocket(serverUrl);

            _ws.OnOpen += () =>
            {
                _reconnectAttempts = 0;
                ConnectionStatus = "Connected";
                Debug.Log($"[NeuroReachClient] Connected to {serverUrl}");
            };

            _ws.OnMessage += bytes =>
            {
                string json = Encoding.UTF8.GetString(bytes);
                var msg = IntentScoreMessage.FromJson(json);
                if (msg != null && msg.Mode != null) // intent_score frames carry a mode
                    IntentScoreBuffer.Shared.Add(msg);
                // Other frame types (pong/status/error) are ignored here for now.
            };

            _ws.OnError += err =>
            {
                ConnectionStatus = "Error";
                Debug.LogWarning($"[NeuroReachClient] WebSocket error: {err}");
            };

            _ws.OnClose += code =>
            {
                if (_intentionalClose) return;
                ConnectionStatus = "Disconnected";
                Debug.LogWarning($"[NeuroReachClient] Closed ({code}). Scheduling reconnect.");
                if (_reconnectRoutine == null)
                    _reconnectRoutine = StartCoroutine(ReconnectLoop());
            };

            try
            {
                await _ws.Connect(); // blocks until the socket closes
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[NeuroReachClient] Connect threw: {e.Message}");
                if (!_intentionalClose && _reconnectRoutine == null)
                    _reconnectRoutine = StartCoroutine(ReconnectLoop());
            }
        }

        private IEnumerator ReconnectLoop()
        {
            while (_reconnectAttempts < maxReconnectAttempts)
            {
                _reconnectAttempts++;
                ConnectionStatus = $"Reconnecting ({_reconnectAttempts}/{maxReconnectAttempts})...";
                yield return new WaitForSeconds(reconnectDelaySeconds);

                // Fire-and-forget; OnOpen resets the counter on success.
                _ = Connect();

                // Wait one cycle to see whether the connection took hold.
                yield return new WaitForSeconds(reconnectDelaySeconds);
                if (ConnectionStatus == "Connected")
                {
                    _reconnectRoutine = null;
                    yield break;
                }
            }

            ConnectionStatus = "Connection failed — giving up";
            Debug.LogError(
                $"[NeuroReachClient] Gave up after {maxReconnectAttempts} reconnect attempts.");
            _reconnectRoutine = null;
        }

        private void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            // Required on non-threading builds; included for portability even though
            // the ship target is Windows Standalone.
            _ws?.DispatchMessageQueue();
#endif
        }

        private async void OnDestroy()
        {
            _intentionalClose = true;
            if (_ws != null)
                await _ws.Close();
        }
    }
}
