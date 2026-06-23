"""Fixed-capacity circular buffer for streaming EEG.

Stores ``[n_channels, n_samples]`` data, evicting the oldest samples once
capacity is exceeded. ``get_window`` always returns an exactly-shaped block,
zero-padded at the FRONT when fewer than the requested number of real samples
have been pushed — so the most recent samples are always right-aligned (the
end of the returned array is "now").
"""

from __future__ import annotations

import numpy as np


class RingBuffer:
    """Circular buffer of recent EEG samples, right-aligned on read."""

    def __init__(self, n_channels: int, capacity_samples: int):
        if n_channels <= 0:
            raise ValueError(f"n_channels must be positive, got {n_channels}")
        if capacity_samples <= 0:
            raise ValueError(f"capacity_samples must be positive, got {capacity_samples}")
        self.n_channels = int(n_channels)
        self.capacity = int(capacity_samples)
        self._buf = np.zeros((self.n_channels, self.capacity), dtype=np.float64)
        self._pos = 0      # index where the NEXT sample will be written
        self._count = 0    # real samples held (capped at capacity)

    # ------------------------------------------------------------------

    def push(self, chunk: np.ndarray) -> None:
        """Append a ``[n_channels, n_new]`` chunk, evicting oldest if over capacity."""
        chunk = np.asarray(chunk, dtype=np.float64)
        if chunk.ndim != 2 or chunk.shape[0] != self.n_channels:
            raise ValueError(
                f"expected [{self.n_channels}, n_new] chunk, got {chunk.shape}"
            )
        n_new = chunk.shape[1]
        if n_new == 0:
            return

        if n_new >= self.capacity:
            # Chunk alone fills (or overfills) the buffer: keep only its tail.
            self._buf[:] = chunk[:, -self.capacity:]
            self._pos = 0
            self._count = self.capacity
            return

        end = self._pos + n_new
        if end <= self.capacity:
            self._buf[:, self._pos:end] = chunk
        else:
            first = self.capacity - self._pos
            self._buf[:, self._pos:] = chunk[:, :first]
            self._buf[:, : n_new - first] = chunk[:, first:]
        self._pos = end % self.capacity
        self._count = min(self._count + n_new, self.capacity)

    # ------------------------------------------------------------------

    def get_window(self, n_samples: int) -> np.ndarray:
        """Most recent ``n_samples`` as ``[n_channels, n_samples]``, front zero-padded.

        Shape is always exactly ``[n_channels, n_samples]`` regardless of fill
        level: real samples are right-aligned, leading positions are zeros.
        """
        if n_samples <= 0:
            raise ValueError(f"n_samples must be positive, got {n_samples}")
        out = np.zeros((self.n_channels, n_samples), dtype=np.float64)
        take = min(n_samples, self._count)
        if take > 0:
            out[:, n_samples - take:] = self._recent(take)
        return out

    def n_samples_available(self) -> int:
        """Number of real (non-padded) samples currently held."""
        return self._count

    # ------------------------------------------------------------------

    def _recent(self, k: int) -> np.ndarray:
        """Return the most recent ``k`` real samples in chronological order."""
        start = (self._pos - k) % self.capacity
        if start + k <= self.capacity:
            return self._buf[:, start:start + k]
        first = self.capacity - start
        return np.concatenate(
            [self._buf[:, start:], self._buf[:, : k - first]], axis=1
        )
