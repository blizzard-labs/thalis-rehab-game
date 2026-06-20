"""
EEG Windowing Pipeline - Sliding window generation for preprocessed EEG data.

Implements sliding windows with:
- Window length: 750ms (94 samples at 125 Hz)
- Step size: 125ms (16 samples at 125 Hz)

Each window inherits the label from its parent trial.
Designed to work with preprocessed data from clean.py (downsampled to 125 Hz).
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Generator, Union, Callable
from collections import deque
import threading


@dataclass
class WindowConfig:
    """Configuration for sliding window generation."""
    
    # Sampling rate (after preprocessing/downsampling from clean.py)
    sample_rate: int = 125  # Hz
    
    # Window parameters (specified directly as samples for precision)
    # 750ms at 125Hz ≈ 94 samples, 125ms at 125Hz ≈ 16 samples
    window_samples_override: Optional[int] = 94  # Set to None to calculate from ms
    step_samples_override: Optional[int] = 16    # Set to None to calculate from ms
    
    # Fallback ms values (used when overrides are None)
    window_length_ms: float = 750.0  # milliseconds
    step_size_ms: float = 125.0  # milliseconds
    
    # EEG channel names (from Unicorn device)
    eeg_channels: List[str] = field(default_factory=lambda: [
        'FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8'
    ])
    
    # For multiband data (alpha/beta separated from clean.py)
    use_multiband: bool = False
    
    # Minimum windows required per trial (trials with fewer windows are discarded)
    min_windows_per_trial: int = 1
    
    @property
    def window_samples(self) -> int:
        """Number of samples per window (94 samples for 750ms at 125Hz)."""
        if self.window_samples_override is not None:
            return self.window_samples_override
        return int(self.sample_rate * self.window_length_ms / 1000.0)
    
    @property
    def step_samples(self) -> int:
        """Number of samples to step between windows (16 samples for 125ms at 125Hz)."""
        if self.step_samples_override is not None:
            return self.step_samples_override
        return int(self.sample_rate * self.step_size_ms / 1000.0)
    
    @property
    def n_channels(self) -> int:
        """Number of EEG channels."""
        if self.use_multiband:
            return len(self.eeg_channels) * 2  # alpha + beta
        return len(self.eeg_channels)
    
    @property
    def channel_names(self) -> List[str]:
        """Get channel names based on multiband setting."""
        if self.use_multiband:
            alpha_channels = [f'alpha_{ch}' for ch in self.eeg_channels]
            beta_channels = [f'beta_{ch}' for ch in self.eeg_channels]
            return alpha_channels + beta_channels
        return self.eeg_channels.copy()


@dataclass
class LabeledWindow:
    """A single labeled window of EEG data."""
    
    data: np.ndarray  # Shape: (window_samples, n_channels) = (94, 8) or (94, 16) for multiband
    label: int  # Trial label (inherited from parent trial)
    trial_id: int  # Which trial this window came from
    window_idx: int  # Index of this window within the trial
    start_sample: int  # Start sample index within the trial
    end_sample: int  # End sample index within the trial
    timestamp_start: Optional[float] = None  # Start timestamp if available
    timestamp_end: Optional[float] = None  # End timestamp if available
    
    def to_dict(self) -> Dict:
        """Convert to dictionary representation."""
        return {
            'data': self.data,
            'label': self.label,
            'trial_id': self.trial_id,
            'window_idx': self.window_idx,
            'start_sample': self.start_sample,
            'end_sample': self.end_sample,
            'timestamp_start': self.timestamp_start,
            'timestamp_end': self.timestamp_end
        }


class SlidingWindowGenerator:
    """
    Generates sliding windows from EEG trials with label inheritance.
    
    Window parameters (at 125 Hz after preprocessing):
    - Window length: 750ms = 94 samples
    - Step size: 125ms = 16 samples
    
    Examples
    --------
    Batch processing of trial data:
    
        >>> generator = SlidingWindowGenerator()
        >>> 
        >>> # Process a single trial (e.g., 4 seconds = 500 samples)
        >>> trial_data = np.random.randn(500, 8)  # 4 seconds of 8-channel data
        >>> windows = generator.process_trial(trial_data, label=1, trial_id=0)
        >>> print(f"Generated {len(windows)} windows")
        
    Processing multiple trials:
    
        >>> trials = [
        ...     {'data': trial1_data, 'label': 0},
        ...     {'data': trial2_data, 'label': 1},
        ... ]
        >>> all_windows = generator.process_trials(trials)
        >>> X, y = generator.to_arrays(all_windows)
        
    Loading from CSV with labels:
    
        >>> generator = SlidingWindowGenerator()
        >>> windows = generator.from_labeled_csv(
        ...     'data/labeled_trials.csv',
        ...     label_column='class'
        ... )
    """
    
    def __init__(self, config: Optional[WindowConfig] = None):
        """
        Initialize sliding window generator.
        
        Parameters
        ----------
        config : WindowConfig, optional
            Configuration object. Uses defaults if not provided.
        """
        self.config = config or WindowConfig()
        self._lock = threading.Lock()
    
    @property
    def window_samples(self) -> int:
        """Number of samples per window."""
        return self.config.window_samples
    
    @property
    def step_samples(self) -> int:
        """Number of samples to step between windows."""
        return self.config.step_samples
    
    def calculate_num_windows(self, n_samples: int) -> int:
        """
        Calculate number of windows that can be extracted from data.
        
        Parameters
        ----------
        n_samples : int
            Total number of samples in the trial.
            
        Returns
        -------
        int
            Number of windows that can be extracted.
        """
        if n_samples < self.window_samples:
            return 0
        return 1 + (n_samples - self.window_samples) // self.step_samples
    
    def process_trial(
        self,
        trial_data: np.ndarray,
        label: int,
        trial_id: int = 0,
        timestamps: Optional[np.ndarray] = None
    ) -> List[LabeledWindow]:
        """
        Extract sliding windows from a single trial.
        
        Parameters
        ----------
        trial_data : ndarray
            EEG data with shape (n_samples, n_channels).
            Expected shape after preprocessing: (n_samples, 8) for standard
            or (n_samples, 16) for multiband (alpha + beta).
        label : int
            Label for this trial (all windows inherit this label).
        trial_id : int, optional
            Identifier for this trial. Default is 0.
        timestamps : ndarray, optional
            Array of timestamps for each sample. Shape: (n_samples,).
            
        Returns
        -------
        list of LabeledWindow
            List of extracted windows with inherited labels.
        """
        n_samples = trial_data.shape[0]
        n_windows = self.calculate_num_windows(n_samples)
        
        if n_windows < self.config.min_windows_per_trial:
            return []
        
        windows = []
        
        # Convert to numpy array if DataFrame
        if hasattr(trial_data, 'values'):
            trial_data = trial_data.values
        
        for win_idx in range(n_windows):
            start_idx = win_idx * self.step_samples
            end_idx = start_idx + self.window_samples
            
            # Extract window data
            window_data = trial_data[start_idx:end_idx, :].copy()
            
            # Get timestamps if available
            ts_start = timestamps[start_idx] if timestamps is not None else None
            ts_end = timestamps[end_idx - 1] if timestamps is not None else None
            
            window = LabeledWindow(
                data=window_data,
                label=label,
                trial_id=trial_id,
                window_idx=win_idx,
                start_sample=start_idx,
                end_sample=end_idx,
                timestamp_start=ts_start,
                timestamp_end=ts_end
            )
            windows.append(window)
        
        return windows
    
    def process_trials(
        self,
        trials: List[Dict],
        data_key: str = 'data',
        label_key: str = 'label'
    ) -> List[LabeledWindow]:
        """
        Extract sliding windows from multiple trials.
        
        Parameters
        ----------
        trials : list of dict
            List of trial dictionaries, each containing:
            - 'data': ndarray of shape (n_samples, n_channels)
            - 'label': int label for the trial
            - 'timestamps': optional array of timestamps
        data_key : str
            Key for data in trial dictionaries. Default is 'data'.
        label_key : str
            Key for label in trial dictionaries. Default is 'label'.
            
        Returns
        -------
        list of LabeledWindow
            All extracted windows from all trials.
        """
        all_windows = []
        
        for trial_id, trial in enumerate(trials):
            trial_data = trial[data_key]
            label = trial[label_key]
            timestamps = trial.get('timestamps', None)
            
            windows = self.process_trial(
                trial_data=trial_data,
                label=label,
                trial_id=trial_id,
                timestamps=timestamps
            )
            all_windows.extend(windows)
        
        return all_windows
    
    def to_arrays(
        self,
        windows: List[LabeledWindow]
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convert list of windows to numpy arrays for ML training.
        
        Parameters
        ----------
        windows : list of LabeledWindow
            List of labeled windows.
            
        Returns
        -------
        X : ndarray
            Data array with shape (n_windows, window_samples, n_channels).
            For default config: (n_windows, 94, 8).
        y : ndarray
            Label array with shape (n_windows,).
        """
        if not windows:
            return np.array([]), np.array([])
        
        X = np.stack([w.data for w in windows], axis=0)
        y = np.array([w.label for w in windows])
        
        return X, y
    
    def to_dataframe(self, windows: List[LabeledWindow]) -> pd.DataFrame:
        """
        Convert windows to a DataFrame with metadata.
        
        Parameters
        ----------
        windows : list of LabeledWindow
            List of labeled windows.
            
        Returns
        -------
        pd.DataFrame
            DataFrame with columns for label, trial_id, window_idx,
            and flattened EEG data.
        """
        records = []
        
        for w in windows:
            record = {
                'label': w.label,
                'trial_id': w.trial_id,
                'window_idx': w.window_idx,
                'start_sample': w.start_sample,
                'end_sample': w.end_sample,
                'timestamp_start': w.timestamp_start,
                'timestamp_end': w.timestamp_end
            }
            
            # Flatten window data and add as columns
            flat_data = w.data.flatten()
            for i, val in enumerate(flat_data):
                record[f'feature_{i}'] = val
            
            records.append(record)
        
        return pd.DataFrame(records)
    
    def from_continuous_data(
        self,
        data: np.ndarray,
        labels: np.ndarray,
        trial_boundaries: List[Tuple[int, int]],
        timestamps: Optional[np.ndarray] = None
    ) -> List[LabeledWindow]:
        """
        Extract windows from continuous data with trial boundaries.
        
        Parameters
        ----------
        data : ndarray
            Continuous EEG data with shape (total_samples, n_channels).
        labels : ndarray
            Label for each trial. Shape: (n_trials,).
        trial_boundaries : list of tuple
            List of (start_idx, end_idx) for each trial.
        timestamps : ndarray, optional
            Timestamps for all samples.
            
        Returns
        -------
        list of LabeledWindow
            All extracted windows.
        """
        all_windows = []
        
        for trial_id, (start, end) in enumerate(trial_boundaries):
            trial_data = data[start:end, :]
            label = labels[trial_id]
            
            ts = timestamps[start:end] if timestamps is not None else None
            
            windows = self.process_trial(
                trial_data=trial_data,
                label=label,
                trial_id=trial_id,
                timestamps=ts
            )
            all_windows.extend(windows)
        
        return all_windows
    
    def from_labeled_csv(
        self,
        csv_path: str,
        label_column: str = 'label',
        trial_column: Optional[str] = 'trial_id',
        time_column: str = 'Time',
        channel_columns: Optional[List[str]] = None
    ) -> List[LabeledWindow]:
        """
        Load and window data from a labeled CSV file.
        
        Parameters
        ----------
        csv_path : str
            Path to CSV file.
        label_column : str
            Column name containing labels. Default is 'label'.
        trial_column : str, optional
            Column name containing trial IDs. If None, treats all data as one trial.
        time_column : str
            Column name for timestamps. Default is 'Time'.
        channel_columns : list of str, optional
            List of channel column names. If None, uses config.eeg_channels.
            
        Returns
        -------
        list of LabeledWindow
            Extracted windows from all trials in the CSV.
        """
        df = pd.read_csv(csv_path)
        
        channels = channel_columns or self.config.channel_names
        
        if trial_column and trial_column in df.columns:
            # Multiple trials in the CSV
            all_windows = []
            
            for trial_id in df[trial_column].unique():
                trial_df = df[df[trial_column] == trial_id]
                trial_data = trial_df[channels].values
                label = trial_df[label_column].iloc[0]  # Assume constant label per trial
                timestamps = trial_df[time_column].values if time_column in df.columns else None
                
                windows = self.process_trial(
                    trial_data=trial_data,
                    label=int(label),
                    trial_id=int(trial_id),
                    timestamps=timestamps
                )
                all_windows.extend(windows)
            
            return all_windows
        else:
            # Single trial or no trial column
            trial_data = df[channels].values
            label = df[label_column].iloc[0] if label_column in df.columns else 0
            timestamps = df[time_column].values if time_column in df.columns else None
            
            return self.process_trial(
                trial_data=trial_data,
                label=int(label),
                trial_id=0,
                timestamps=timestamps
            )


class RealTimeWindowBuffer:
    """
    Real-time sliding window buffer for online processing.
    
    Accumulates samples and emits windows when enough data is available.
    Designed to integrate with the EEGStream callback system.
    
    Examples
    --------
    Integration with EEGStream and preprocessor:
    
        >>> from unicorneeg.stream import EEGStream, EEGStreamConfig
        >>> from unicorneeg.clean import EEGPreprocessor, create_preprocessing_callback
        >>> from unicorneeg.pipe import RealTimeWindowBuffer
        >>> 
        >>> # Setup preprocessing
        >>> preprocessor = EEGPreprocessor()
        >>> 
        >>> # Setup windowing
        >>> window_buffer = RealTimeWindowBuffer(current_label=0)
        >>> 
        >>> def on_window(window):
        ...     print(f"Got window {window.window_idx} with label {window.label}")
        ...     # Feed to classifier here
        >>> 
        >>> window_buffer.on_window(on_window)
        >>> 
        >>> # Create preprocessing callback that feeds into window buffer
        >>> def process_and_window(sample):
        ...     # sample is preprocessed dict from clean.py
        ...     window_buffer.add_sample(sample)
        >>> 
        >>> preprocess_callback = create_preprocessing_callback(
        ...     preprocessor=preprocessor,
        ...     output_callback=process_and_window,
        ...     output_band='combined'
        ... )
        >>> 
        >>> # Start streaming
        >>> config = EEGStreamConfig(use_background_thread=True)
        >>> stream = EEGStream(config)
        >>> stream.on_sample(preprocess_callback)
        >>> stream.start()
    """
    
    def __init__(
        self,
        config: Optional[WindowConfig] = None,
        current_label: int = 0,
        trial_id: int = 0
    ):
        """
        Initialize real-time window buffer.
        
        Parameters
        ----------
        config : WindowConfig, optional
            Window configuration. Uses defaults if not provided.
        current_label : int
            Initial label for windows. Can be changed during runtime.
        trial_id : int
            Initial trial ID.
        """
        self.config = config or WindowConfig()
        self._lock = threading.Lock()
        
        # Sample buffer
        self._buffer: deque = deque(maxlen=self.config.window_samples * 2)
        self._timestamps: deque = deque(maxlen=self.config.window_samples * 2)
        
        # Current state
        self._current_label = current_label
        self._trial_id = trial_id
        self._window_idx = 0
        self._samples_since_last_window = 0
        self._total_samples = 0
        
        # Callbacks
        self._window_callbacks: List[Callable[[LabeledWindow], None]] = []
    
    def on_window(self, callback: Callable[[LabeledWindow], None]) -> 'RealTimeWindowBuffer':
        """
        Register a callback to be called when a new window is ready.
        
        Parameters
        ----------
        callback : callable
            Function that takes a LabeledWindow as argument.
            
        Returns
        -------
        RealTimeWindowBuffer
            Self for method chaining.
        """
        self._window_callbacks.append(callback)
        return self
    
    def set_label(self, label: int) -> None:
        """
        Set the current label for subsequent windows.
        
        Parameters
        ----------
        label : int
            New label value.
        """
        with self._lock:
            self._current_label = label
    
    def new_trial(self, trial_id: Optional[int] = None, label: Optional[int] = None) -> None:
        """
        Start a new trial, resetting window counter and optionally buffer.
        
        Parameters
        ----------
        trial_id : int, optional
            New trial ID. If None, increments current trial ID.
        label : int, optional
            Label for the new trial. If None, keeps current label.
        """
        with self._lock:
            self._trial_id = trial_id if trial_id is not None else self._trial_id + 1
            if label is not None:
                self._current_label = label
            self._window_idx = 0
            self._samples_since_last_window = 0
    
    def reset(self) -> None:
        """Reset the buffer and all counters."""
        with self._lock:
            self._buffer.clear()
            self._timestamps.clear()
            self._window_idx = 0
            self._samples_since_last_window = 0
            self._total_samples = 0
    
    def add_sample(self, sample: Dict) -> Optional[LabeledWindow]:
        """
        Add a preprocessed sample to the buffer.
        
        Parameters
        ----------
        sample : dict
            Preprocessed sample from clean.py containing channel data.
            Expected keys: channel names (FZ, C3, CZ, C4, PZ, PO7, OZ, PO8)
            or multiband variants (alpha_FZ, beta_FZ, etc.)
            
        Returns
        -------
        LabeledWindow or None
            Returns a window if one was emitted, otherwise None.
        """
        with self._lock:
            # Extract channel data from sample
            channels = self.config.channel_names
            sample_data = np.array([sample.get(ch, 0.0) for ch in channels])
            timestamp = sample.get('Time', None)
            
            self._buffer.append(sample_data)
            self._timestamps.append(timestamp)
            self._total_samples += 1
            self._samples_since_last_window += 1
            
            # Check if we can emit a window
            window = self._try_emit_window()
            
            return window
    
    def add_samples_batch(self, samples: np.ndarray, timestamps: Optional[np.ndarray] = None) -> List[LabeledWindow]:
        """
        Add multiple samples at once.
        
        Parameters
        ----------
        samples : ndarray
            Array of samples with shape (n_samples, n_channels).
        timestamps : ndarray, optional
            Array of timestamps with shape (n_samples,).
            
        Returns
        -------
        list of LabeledWindow
            List of windows emitted from this batch.
        """
        windows = []
        
        for i in range(samples.shape[0]):
            sample_dict = {ch: samples[i, j] for j, ch in enumerate(self.config.channel_names)}
            if timestamps is not None:
                sample_dict['Time'] = timestamps[i]
            
            window = self.add_sample(sample_dict)
            if window is not None:
                windows.append(window)
        
        return windows
    
    def _try_emit_window(self) -> Optional[LabeledWindow]:
        """
        Try to emit a window if conditions are met.
        
        Returns
        -------
        LabeledWindow or None
            Window if emitted, otherwise None.
        """
        # Need enough samples in buffer
        if len(self._buffer) < self.config.window_samples:
            return None
        
        # Need to have stepped enough samples since last window
        # (except for first window)
        if self._window_idx > 0 and self._samples_since_last_window < self.config.step_samples:
            return None
        
        # Extract window from buffer (most recent window_samples)
        buffer_list = list(self._buffer)
        start_idx = len(buffer_list) - self.config.window_samples
        window_data = np.array(buffer_list[start_idx:])
        
        # Get timestamps
        ts_list = list(self._timestamps)
        ts_start = ts_list[start_idx] if ts_list[start_idx] is not None else None
        ts_end = ts_list[-1] if ts_list[-1] is not None else None
        
        # Create window
        window = LabeledWindow(
            data=window_data,
            label=self._current_label,
            trial_id=self._trial_id,
            window_idx=self._window_idx,
            start_sample=self._total_samples - self.config.window_samples,
            end_sample=self._total_samples,
            timestamp_start=ts_start,
            timestamp_end=ts_end
        )
        
        # Update state
        self._window_idx += 1
        self._samples_since_last_window = 0
        
        # Notify callbacks
        for callback in self._window_callbacks:
            callback(window)
        
        return window
    
    @property
    def current_label(self) -> int:
        """Get the current label."""
        return self._current_label
    
    @property
    def windows_emitted(self) -> int:
        """Get the number of windows emitted in current trial."""
        return self._window_idx
    
    @property
    def buffer_length(self) -> int:
        """Get current buffer length in samples."""
        return len(self._buffer)


def create_windowing_callback(
    window_buffer: RealTimeWindowBuffer,
    output_callback: Optional[Callable[[LabeledWindow], None]] = None
) -> Callable[[Dict], None]:
    """
    Create a callback function for use with preprocessor output.
    
    This bridges the preprocessing pipeline (clean.py) with the windowing
    pipeline (pipe.py).
    
    Parameters
    ----------
    window_buffer : RealTimeWindowBuffer
        The window buffer to accumulate samples.
    output_callback : callable, optional
        Function to call when a window is ready.
        
    Returns
    -------
    callable
        Callback function that accepts preprocessed samples.
        
    Examples
    --------
    Complete pipeline setup:
    
        >>> from unicorneeg.clean import EEGPreprocessor, create_preprocessing_callback
        >>> from unicorneeg.pipe import RealTimeWindowBuffer, create_windowing_callback
        >>> 
        >>> preprocessor = EEGPreprocessor()
        >>> window_buffer = RealTimeWindowBuffer(current_label=0)
        >>> 
        >>> def on_window(window):
        ...     # Process window (e.g., classify)
        ...     prediction = classifier.predict(window.data)
        ...     print(f"Prediction: {prediction}")
        >>> 
        >>> windowing_callback = create_windowing_callback(window_buffer, on_window)
        >>> preprocess_callback = create_preprocessing_callback(
        ...     preprocessor=preprocessor,
        ...     output_callback=windowing_callback,
        ...     output_band='combined'
        ... )
    """
    if output_callback is not None:
        window_buffer.on_window(output_callback)
    
    def callback(sample: Dict) -> None:
        window_buffer.add_sample(sample)
    
    return callback


# Utility functions

def print_window_stats(windows: List[LabeledWindow]) -> None:
    """Print statistics about generated windows."""
    if not windows:
        print("No windows generated.")
        return
    
    labels = [w.label for w in windows]
    unique_labels, counts = np.unique(labels, return_counts=True)
    
    print(f"Total windows: {len(windows)}")
    print(f"Window shape: {windows[0].data.shape}")
    print(f"Unique trials: {len(set(w.trial_id for w in windows))}")
    print(f"Label distribution:")
    for label, count in zip(unique_labels, counts):
        print(f"  Label {label}: {count} windows ({100*count/len(windows):.1f}%)")


def validate_window_config(config: WindowConfig) -> bool:
    """
    Validate window configuration parameters.
    
    Parameters
    ----------
    config : WindowConfig
        Configuration to validate.
        
    Returns
    -------
    bool
        True if valid.
        
    Raises
    ------
    ValueError
        If configuration is invalid.
    """
    if config.window_samples <= 0:
        raise ValueError(f"Window samples must be positive, got {config.window_samples}")
    
    if config.step_samples <= 0:
        raise ValueError(f"Step samples must be positive, got {config.step_samples}")
    
    if config.step_samples > config.window_samples:
        raise ValueError(
            f"Step size ({config.step_samples}) cannot exceed window size ({config.window_samples})"
        )
    
    return True


if __name__ == "__main__":
    # Demo/test code
    print("EEG Sliding Window Pipeline")
    print("=" * 50)
    
    # Create config with default parameters
    config = WindowConfig()
    print(f"Sample rate: {config.sample_rate} Hz")
    print(f"Window length: {config.window_length_ms} ms = {config.window_samples} samples")
    print(f"Step size: {config.step_size_ms} ms = {config.step_samples} samples")
    print(f"Channels: {config.n_channels}")
    print()
    
    # Test with synthetic data
    generator = SlidingWindowGenerator(config)
    
    # Simulate a 4-second trial (500 samples at 125 Hz)
    np.random.seed(42)
    trial_duration_seconds = 4.0
    n_samples = int(trial_duration_seconds * config.sample_rate)
    trial_data = np.random.randn(n_samples, config.n_channels)
    
    print(f"Trial duration: {trial_duration_seconds}s = {n_samples} samples")
    print(f"Expected windows: {generator.calculate_num_windows(n_samples)}")
    
    windows = generator.process_trial(trial_data, label=1, trial_id=0)
    print(f"Generated windows: {len(windows)}")
    print()
    
    if windows:
        print(f"First window:")
        print(f"  Shape: {windows[0].data.shape}")
        print(f"  Label: {windows[0].label}")
        print(f"  Trial ID: {windows[0].trial_id}")
        print(f"  Window idx: {windows[0].window_idx}")
        print(f"  Sample range: [{windows[0].start_sample}, {windows[0].end_sample})")
    
    # Test multiple trials
    print()
    print("Testing multiple trials...")
    trials = [
        {'data': np.random.randn(500, 8), 'label': 0},  # 4s, class 0
        {'data': np.random.randn(375, 8), 'label': 1},  # 3s, class 1
        {'data': np.random.randn(625, 8), 'label': 0},  # 5s, class 0
    ]
    
    all_windows = generator.process_trials(trials)
    print_window_stats(all_windows)
    
    # Convert to arrays
    X, y = generator.to_arrays(all_windows)
    print(f"\nArray shapes: X={X.shape}, y={y.shape}")
