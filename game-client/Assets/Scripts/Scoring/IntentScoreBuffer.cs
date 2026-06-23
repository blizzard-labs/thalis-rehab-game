using System;

namespace NeuroReach.Scoring
{
    /// <summary>
    /// Fixed-size circular buffer of the most recent IntentScoreMessage frames.
    /// Pure C# — not a MonoBehaviour. Default capacity 600 = 30 s at 20 Hz.
    ///
    /// The networking layer writes (Add) and the game layer reads
    /// (Latest / RecentAverage / StreakAboveThreshold). Use the static
    /// <see cref="Shared"/> instance as the single bridge between
    /// NeuroReachClient (producer) and GardenGrowController (consumer).
    /// </summary>
    public class IntentScoreBuffer
    {
        /// <summary>Process-wide buffer shared between producer and consumers.</summary>
        public static IntentScoreBuffer Shared { get; } = new IntentScoreBuffer();

        private readonly IntentScoreMessage[] _items;
        private int _head;   // index where the next Add will write
        private int _count;  // number of valid items (<= capacity)
        private readonly object _lock = new object();

        public int Capacity => _items.Length;
        public int Count { get { lock (_lock) { return _count; } } }

        public IntentScoreBuffer(int capacity = 600)
        {
            if (capacity <= 0)
                throw new ArgumentOutOfRangeException(nameof(capacity), "capacity must be > 0");
            _items = new IntentScoreMessage[capacity];
        }

        /// <summary>Push a frame. Oldest frame is overwritten once full.</summary>
        public void Add(IntentScoreMessage msg)
        {
            if (msg == null) return;
            lock (_lock)
            {
                _items[_head] = msg;
                _head = (_head + 1) % _items.Length;
                if (_count < _items.Length) _count++;
            }
        }

        /// <summary>Most recent frame, or null if the buffer is empty.</summary>
        public IntentScoreMessage Latest
        {
            get
            {
                lock (_lock)
                {
                    if (_count == 0) return null;
                    int idx = (_head - 1 + _items.Length) % _items.Length;
                    return _items[idx];
                }
            }
        }

        /// <summary>
        /// Mean IntentScore of the last <paramref name="n"/> frames.
        /// Returns 0 if fewer than n frames exist (caller can't trust a partial window).
        /// </summary>
        public float RecentAverage(int n)
        {
            if (n <= 0) return 0f;
            lock (_lock)
            {
                if (_count < n) return 0f;
                float sum = 0f;
                for (int i = 0; i < n; i++)
                {
                    int idx = (_head - 1 - i + _items.Length * 2) % _items.Length;
                    sum += _items[idx].IntentScore;
                }
                return sum / n;
            }
        }

        /// <summary>
        /// True iff the last <paramref name="n"/> frames all have
        /// IntentScore &gt;= <paramref name="threshold"/>. Returns false when
        /// fewer than n frames exist (no full window = no streak).
        /// </summary>
        public bool StreakAboveThreshold(float threshold, int n)
        {
            if (n <= 0) return false;
            lock (_lock)
            {
                if (_count < n) return false;
                for (int i = 0; i < n; i++)
                {
                    int idx = (_head - 1 - i + _items.Length * 2) % _items.Length;
                    if (_items[idx].IntentScore < threshold) return false;
                }
                return true;
            }
        }

        /// <summary>Drop all frames (e.g. on session restart).</summary>
        public void Clear()
        {
            lock (_lock)
            {
                Array.Clear(_items, 0, _items.Length);
                _head = 0;
                _count = 0;
            }
        }
    }
}
