"""
EEG Stream Module - Object-oriented LSL stream handler for Unicorn EEG devices.

Provides configurable options for:
- Real-time visualization console (PyQt6-based)
- CSV data saving (direct append on every sample — no buffering)
- Background thread data collection for concurrent processing
"""

from pylsl import StreamInlet, resolve_byprop
import pandas as pd
import csv
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional, List, Dict, Any
from pathlib import Path
import threading
import time
import sys


@dataclass
class EEGStreamConfig:
    """Configuration for EEGStream."""
    stream_name: str = 'UN-2024.06.42'
    sample_rate: int = 250  # Hz
    buffer_seconds: int = 10  # seconds of data to keep in rolling buffer
    
    # Column configuration
    columns: List[str] = field(default_factory=lambda: [
        'Time', 'FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8',
        'AccX', 'AccY', 'AccZ', 'Gyro1', 'Gyro2', 'Gyro3', 'Battery', 'Counter', 'Validation'
    ])
    
    # EEG channel names (subset of columns for visualization)
    eeg_channels: List[str] = field(default_factory=lambda: [
        'FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8'
    ])
    
    # Visualization options (replaces old matplotlib graphing)
    enable_visualization: bool = True
    
    # Legacy graphing options (deprecated - use enable_visualization)
    enable_graphing: bool = True
    plot_rows: int = 5
    plot_cols: int = 4
    figure_size: tuple = (16, 12)
    
    # CSV saving options
    enable_csv_save: bool = True
    csv_path: str = 'EEGdata.csv'
    save_duration_seconds: float = 60.0
    
    # Threading options
    use_background_thread: bool = False
    
    # Burn-in period: data is processed but discarded during this time
    # Plots and buffers are reset after burn-in completes
    burn_in_seconds: float = 0.0  # 0 means no burn-in
    
    @property
    def buffer_maxlen(self) -> int:
        return self.sample_rate * self.buffer_seconds
    
    @property
    def plot_columns(self) -> List[str]:
        return [c for c in self.columns if c != 'Time']


class EEGStream:
    """
    Object-oriented EEG data stream handler with support for real-time
    graphing, CSV saving, and background thread data collection.
    
    Examples
    --------
    Basic usage with graphing and CSV saving:
    
        >>> stream = EEGStream()
        >>> stream.start()  # Blocks until duration complete, shows live plot
    
    Background collection with callback for concurrent processing:
    
        >>> def process_sample(sample: dict):
        ...     # Process each sample in real-time
        ...     print(f"Got sample at {sample['Time']}")
        ...
        >>> config = EEGStreamConfig(use_background_thread=True, enable_graphing=False)
        >>> stream = EEGStream(config)
        >>> stream.on_sample(process_sample)
        >>> stream.start()  # Returns immediately
        >>> # ... do other work while collecting ...
        >>> stream.stop()
        >>> data = stream.get_dataframe()
    
    Just collect data without graphing:
    
        >>> config = EEGStreamConfig(enable_graphing=False, save_duration_seconds=30)
        >>> stream = EEGStream(config)
        >>> stream.start()
        >>> df = stream.get_dataframe()
    """
    
    def __init__(self, config: Optional[EEGStreamConfig] = None):
        """
        Initialize EEGStream with the given configuration.
        
        Parameters
        ----------
        config : EEGStreamConfig, optional
            Configuration object. Uses defaults if not provided.
        """
        self.config = config or EEGStreamConfig()
        self._inlet: Optional[StreamInlet] = None
        self._data_buffers: Dict[str, deque] = {}
        self._start_time: Optional[float] = None
        self._running: bool = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        
        # Callbacks for sample processing
        self._sample_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        
        # Burn-in state tracking
        self._burn_in_complete: bool = False
        self._burn_in_callbacks: List[Callable[[], None]] = []
        
        # Direct CSV writing — file handle opened once, rows appended immediately
        self._csv_file = None
        self._csv_writer = None
        self._csv_samples_written: int = 0
        
        # Plotting state
        self._fig = None
        self._axes = None
        self._lines: Dict[str, Any] = {}
        
    def connect(self) -> 'EEGStream':
        """
        Connect to the LSL stream.
        
        Returns
        -------
        EEGStream
            Self for method chaining.
            
        Raises
        ------
        RuntimeError
            If no LSL stream is found with the configured name.
        """
        streams = resolve_byprop('name', self.config.stream_name)
        if not streams:
            raise RuntimeError(f"No LSL stream found with name '{self.config.stream_name}'")
        self._inlet = StreamInlet(streams[0])
        self._init_buffers()
        return self
    
    def _init_buffers(self) -> None:
        """Initialize data buffers for all columns."""
        maxlen = self.config.buffer_maxlen
        self._data_buffers = {col: deque(maxlen=maxlen) for col in self.config.columns}
    
    def on_sample(self, callback: Callable[[Dict[str, Any]], None]) -> 'EEGStream':
        """
        Register a callback to be called for each new sample.
        
        Useful for concurrent processing when running in background thread.
        
        Parameters
        ----------
        callback : callable
            Function that receives a dict with column names as keys and sample values.
            
        Returns
        -------
        EEGStream
            Self for method chaining.
        """
        self._sample_callbacks.append(callback)
        return self
    
    def remove_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Remove a previously registered callback."""
        if callback in self._sample_callbacks:
            self._sample_callbacks.remove(callback)
    
    def on_burn_in_complete(self, callback: Callable[[], None]) -> 'EEGStream':
        """
        Register a callback to be called when burn-in period completes.
        
        Useful for resetting external buffers/state after burn-in.
        
        Parameters
        ----------
        callback : callable
            Function with no arguments, called once when burn-in completes.
            
        Returns
        -------
        EEGStream
            Self for method chaining.
        """
        self._burn_in_callbacks.append(callback)
        return self
    
    def is_burn_in_complete(self) -> bool:
        """Check if burn-in period has completed."""
        return self._burn_in_complete
    
    def _setup_visualization_console(self) -> None:
        """Initialize the PyQt6 visualization console."""
        if not self.config.enable_visualization:
            return
        
        # Import visualization components
        try:
            from tools.visualization import EEGVisualizationConsole, VisualizationConfig
            from PyQt6.QtWidgets import QApplication
            
            # Create QApplication if needed
            self._app = QApplication.instance()
            if self._app is None:
                self._app = QApplication(sys.argv)
            
            # Create visualization config (CSV is handled by EEGStream, not the console)
            viz_config = VisualizationConfig(
                channel_names=self.config.eeg_channels,
                sample_rate=self.config.sample_rate,
                display_seconds=self.config.buffer_seconds,
            )
            
            # Create console
            self._viz_console = EEGVisualizationConsole(viz_config)
            self._viz_console.show()
            
            # Register stop callback so console can stop the stream
            self._viz_console.set_stop_callback(self._handle_console_stop)
            
            # Start console timers
            self._viz_console.start()
            
            print("[Visualization] Console initialized")
            
        except ImportError as e:
            print(f"Warning: Could not import visualization console: {e}")
            print("Falling back to no visualization.")
            self.config.enable_visualization = False
            self._viz_console = None
    
    def _handle_console_stop(self) -> None:
        """Handle stop request from visualization console."""
        print("\n[Stream] Stop requested from visualization console...")
        self._running = False
    
    def reset_visualization(self) -> None:
        """
        Reset the visualization console, clearing displayed data.
        
        Called automatically after burn-in period completes to give a fresh start.
        """
        if hasattr(self, '_viz_console') and self._viz_console is not None:
            self._viz_console.reset()
    
    def _update_visualization(self) -> None:
        """Update visualization console with current data."""
        if not self.config.enable_visualization:
            return
        
        if not hasattr(self, '_viz_console') or self._viz_console is None:
            return
        
        if hasattr(self, '_app') and self._app is not None:
            # Process Qt events
            self._app.processEvents()
    
    def _collect_sample(self) -> Optional[Dict[str, Any]]:
        """
        Pull and store a single sample from the stream.
        
        If CSV saving is enabled and burn-in is complete, the sample is
        appended directly to the CSV file on disk (no intermediate buffer).
        
        Returns
        -------
        dict or None
            The sample as a dict, or None if no sample available.
        """
        if self._inlet is None:
            return None
            
        data, timestamp = self._inlet.pull_sample(timeout=0.1)
        if data is None:
            return None
            
        if self._start_time is None:
            self._start_time = time.time()
        
        all_data = [timestamp] + data
        sample = {}
        
        with self._lock:
            for i, key in enumerate(self.config.columns):
                self._data_buffers[key].append(all_data[i])
                sample[key] = all_data[i]
        
        # ── Direct CSV append (after burn-in) ──
        if self._burn_in_complete and self._csv_writer is not None:
            try:
                self._csv_writer.writerow(sample)
                self._csv_samples_written += 1
                # Flush to OS every 500 samples (~2 seconds at 250 Hz)
                if self._csv_samples_written % 500 == 0:
                    self._csv_file.flush()
            except Exception as e:
                print(f"Warning: CSV write error: {e}")
        
        # Invoke callbacks (even during burn-in for preprocessing pipeline warmup)
        for callback in self._sample_callbacks:
            try:
                callback(sample)
            except Exception as e:
                print(f"Warning: Sample callback raised exception: {e}")
        
        return sample
    
    def _check_burn_in_complete(self) -> bool:
        """
        Check if burn-in period has completed and handle transition.
        
        Returns
        -------
        bool
            True if burn-in just completed (transition), False otherwise.
        """
        if self._burn_in_complete or self.config.burn_in_seconds <= 0:
            return False
        
        elapsed = time.time() - self._start_time
        if elapsed >= self.config.burn_in_seconds:
            self._burn_in_complete = True
            print(f"\n[Burn-in Complete] {self.config.burn_in_seconds}s burn-in period finished. Resetting buffers...")
            
            # Clear all data buffers - discard burn-in data
            self.clear_buffers()
            
            # Reset the start time so duration tracking starts fresh
            self._start_time = time.time()
            
            # Reset visualization
            self.reset_visualization()
            
            # Open CSV file for direct writing now that burn-in is done
            self._open_csv_file()
            
            # Notify visualization console that burn-in is complete
            if hasattr(self, '_viz_console') and self._viz_console is not None:
                self._viz_console.set_burn_in_complete(True)
            
            # Invoke burn-in complete callbacks (e.g., reset window buffers)
            for callback in self._burn_in_callbacks:
                try:
                    callback()
                except Exception as e:
                    print(f"Warning: Burn-in callback raised exception: {e}")
            
            print("[Burn-in Complete] Data collection now active.\n")
            return True
        
        return False
    
    def _open_csv_file(self) -> None:
        """
        Open the CSV file for direct sample-by-sample writing.
        
        Called once when burn-in completes (or immediately if no burn-in).
        The file is created with headers; subsequent samples are appended
        one row at a time inside _collect_sample().
        """
        if not self.config.enable_csv_save or not self.config.csv_path:
            return
        
        try:
            csv_path = Path(self.config.csv_path)
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            
            self._csv_file = open(csv_path, 'w', newline='')
            self._csv_writer = csv.DictWriter(
                self._csv_file,
                fieldnames=self.config.columns
            )
            self._csv_writer.writeheader()
            self._csv_file.flush()
            self._csv_samples_written = 0
            
            print(f"[CSV] Opened for writing: {csv_path}")
        except Exception as e:
            print(f"[CSV] Error opening file: {e}")
            self._csv_file = None
            self._csv_writer = None
    
    def _close_csv_file(self) -> None:
        """Flush and close the CSV file."""
        if self._csv_file is not None:
            try:
                self._csv_file.flush()
                self._csv_file.close()
                print(f"[CSV] Closed: {self.config.csv_path} ({self._csv_samples_written} samples written)")
            except Exception as e:
                print(f"[CSV] Error closing file: {e}")
            self._csv_file = None
            self._csv_writer = None
    
    def _collection_loop(self) -> None:
        """Main data collection loop."""
        while self._running:
            sample = self._collect_sample()
            if sample is None:
                continue
            
            # Check if burn-in period completed
            self._check_burn_in_complete()
            
            # Check duration limit (only after burn-in complete)
            if self._burn_in_complete or self.config.burn_in_seconds <= 0:
                if self.config.save_duration_seconds > 0:
                    elapsed = time.time() - self._start_time
                    if elapsed >= self.config.save_duration_seconds:
                        self._running = False
                        break
    
    def _collection_loop_with_visualization(self) -> None:
        """Data collection loop with real-time visualization (must run in main thread)."""
        while self._running:
            sample = self._collect_sample()
            if sample is None:
                continue
            
            # Check if burn-in period completed
            self._check_burn_in_complete()
            
            # Update visualization (process Qt events)
            self._update_visualization()
            
            # Check duration limit (only after burn-in complete, and only if duration > 0)
            # Duration of 0 means "indefinite" - run until stopped from console
            if self._burn_in_complete or self.config.burn_in_seconds <= 0:
                if self.config.save_duration_seconds > 0:
                    elapsed = time.time() - self._start_time
                    if elapsed >= self.config.save_duration_seconds:
                        self._running = False
                        break
    
    def start(self) -> 'EEGStream':
        """
        Start data collection.
        
        If use_background_thread is True, returns immediately and collection
        runs in background. Otherwise, blocks until duration is complete.
        
        Returns
        -------
        EEGStream
            Self for method chaining.
        """
        if self._inlet is None:
            self.connect()
        
        self._running = True
        self._start_time = None
        self._burn_in_complete = self.config.burn_in_seconds <= 0  # Skip burn-in if duration is 0
        
        # Print burn-in info if enabled
        if self.config.burn_in_seconds > 0:
            print(f"[Burn-in] Starting {self.config.burn_in_seconds}s burn-in period. Data will be processed but discarded...")
        else:
            # No burn-in — open CSV file immediately so samples are written from the start
            self._open_csv_file()
        
        if self.config.use_background_thread:
            # Background thread mode - visualization disabled (Qt not thread-safe from background)
            if self.config.enable_visualization:
                print("Warning: Visualization console disabled in background thread mode")
            self._thread = threading.Thread(target=self._collection_loop, daemon=True)
            self._thread.start()
        else:
            # Foreground mode - can do visualization
            if self.config.enable_visualization:
                self._setup_visualization_console()
                
                # Register visualization callback
                if hasattr(self, '_viz_console') and self._viz_console is not None:
                    self.on_sample(self._viz_console.create_sample_callback())
                    
                    # If no burn-in period, mark console as ready for data collection immediately
                    if self.config.burn_in_seconds <= 0:
                        self._viz_console.set_burn_in_complete(True)
            
            self._collection_loop_with_visualization()
            
            # Close CSV file when collection loop exits
            self._close_csv_file()
            
            # Cleanup visualization
            if self.config.enable_visualization and hasattr(self, '_viz_console') and self._viz_console is not None:
                print("Data collection finished.")
                finished = '''
                     ______                      __     __     
                    / ____/___  ____ ___  ____  / /__  / /____ 
                    / /   / __ \/ __ `__ \/ __ \/ / _ \/ __/ _ \\
                    / /___/ /_/ / / / / / / /_/ / /  __/ /_/  __/
                    \____/\____/_/ /_/ /_/ .___/_/\___/\__/\___/ 
                                        /_/                      
                '''
                print(finished + '\n\n')
                
                # Keep Qt app running until window closed
                if hasattr(self, '_app') and self._app is not None:
                    self._viz_console.stop()
                    self._app.exec()
        
        return self
    
    def start_with_console(self) -> 'EEGStream':
        """
        Start data collection with visualization console.
        
        This method enables the visualization console and starts
        data collection in the main thread.
        
        Returns
        -------
        EEGStream
            Self for method chaining.
        """
        self.config.enable_visualization = True
        self.config.use_background_thread = False
        return self.start()
    
    def stop(self) -> 'EEGStream':
        """
        Stop data collection.
        
        Returns
        -------
        EEGStream
            Self for method chaining.
        """
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        
        # Close CSV file
        self._close_csv_file()
        
        # Stop visualization console
        if hasattr(self, '_viz_console') and self._viz_console is not None:
            self._viz_console.stop()
        
        return self
    
    def is_running(self) -> bool:
        """Check if data collection is currently running."""
        return self._running
    
    def get_dataframe(self) -> pd.DataFrame:
        """
        Get collected data as a pandas DataFrame.
        
        Returns
        -------
        pd.DataFrame
            DataFrame with all collected samples.
        """
        with self._lock:
            return pd.DataFrame({k: list(v) for k, v in self._data_buffers.items()})
    
    def get_latest_samples(self, n: int = 1) -> pd.DataFrame:
        """
        Get the N most recent samples.
        
        Parameters
        ----------
        n : int
            Number of samples to retrieve.
            
        Returns
        -------
        pd.DataFrame
            DataFrame with the N most recent samples.
        """
        df = self.get_dataframe()
        return df.tail(n)
    
    def get_buffer(self, column: str) -> List[float]:
        """
        Get the current buffer contents for a specific column.
        
        Parameters
        ----------
        column : str
            Column name (e.g., 'FZ', 'C3', 'Time').
            
        Returns
        -------
        list
            List of values in the buffer.
        """
        with self._lock:
            return list(self._data_buffers.get(column, []))
    
    def save_csv(self, path: Optional[str] = None) -> Path:
        """
        Save collected data to CSV file.
        
        Parameters
        ----------
        path : str, optional
            Output file path. Uses config.csv_path if not provided.
            
        Returns
        -------
        Path
            Path to the saved file.
        """
        save_path = Path(path or self.config.csv_path)
        df = self.get_dataframe()
        df.to_csv(save_path, index=False)
        print(f"Saved EEG data to {save_path}")
        return save_path
    
    def clear_buffers(self) -> None:
        """Clear all data buffers."""
        with self._lock:
            for buffer in self._data_buffers.values():
                buffer.clear()
        self._start_time = None
    
    '''
    @property
    def elapsed_time(self) -> float:
        """Get elapsed collection time in seconds."""
        if self._start_time is None:
            return 0.0
        with self._lock:
            times = self._data_buffers.get('Time', deque())
            if times:
                return times[-1] - self._start_time
        return 0.0
    '''
    
    @property
    def sample_count(self) -> int:
        """Get the number of samples currently in buffer."""
        with self._lock:
            times = self._data_buffers.get('Time', deque())
            return len(times)
    
    def __enter__(self) -> 'EEGStream':
        """Context manager entry."""
        return self.connect()
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        self.stop()


# Convenience function for quick usage
def collect_eeg(
    duration: float = 60.0,
    stream_name: str = 'UN-2024.06.42',
    enable_visualization: bool = True,
    csv_path: Optional[str] = 'EEGdata.csv'
) -> pd.DataFrame:
    """
    Convenience function to collect EEG data with sensible defaults.
    
    Parameters
    ----------
    duration : float
        Collection duration in seconds.
    stream_name : str
        LSL stream name to connect to.
    enable_visualization : bool
        Whether to show real-time visualization console.
    csv_path : str, optional
        Path to save CSV. Set to None to skip saving.
        
    Returns
    -------
    pd.DataFrame
        Collected EEG data.
    """
    config = EEGStreamConfig(
        stream_name=stream_name,
        save_duration_seconds=duration,
        enable_visualization=enable_visualization,
        enable_graphing=enable_visualization,  # Legacy compat
        enable_csv_save=csv_path is not None,
        csv_path=csv_path or 'EEGdata.csv'
    )
    stream = EEGStream(config)
    stream.start()
    return stream.get_dataframe()


# Example usage when run directly
if __name__ == '__main__':
    # Basic usage with visualization console
    print("Starting EEG collection with visualization console...")
    config = EEGStreamConfig(
        enable_visualization=True,
        save_duration_seconds=60
    )
    stream = EEGStream(config)
    stream.start()
    
    # Example 2: Background collection with processing callback
    # def process_sample(sample):
    #     print(f"Processing sample at t={sample['Time']:.3f}")
    #
    # config = EEGStreamConfig(
    #     use_background_thread=True,
    #     enable_visualization=False,
    #     save_duration_seconds=30
    # )
    # stream = EEGStream(config)
    # stream.on_sample(process_sample)
    # stream.start()
    # 
    # # Do other work while collecting
    # while stream.is_running():
    #     print(f"Collected {stream.sample_count} samples")
    #     time.sleep(1)
    #
    # stream.save_csv('my_data.csv')
    # df = stream.get_dataframe()