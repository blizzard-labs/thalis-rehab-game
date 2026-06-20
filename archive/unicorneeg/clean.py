"""
EEG Preprocessing Module - Real-time signal preprocessing for Unicorn EEG data.

Implements:
1. Rereferencing (common average reference)
2. Line Noise Handling (2nd order IIR Notch filter @ 60Hz)
3. Detrending (constant detrend to remove DC offset)
4. Bandpass Filtering (4th order Butterworth for alpha 8-13Hz and beta 13-30Hz)
5. Downsampling (250 Hz -> 125 Hz)

Designed for real-time processing during data collection with stream.py.
"""

import numpy as np
from scipy import signal
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Deque
from collections import deque
import threading


@dataclass
class PreprocessingConfig:
    """Configuration for EEG preprocessing pipeline."""
    
    # Sampling rates
    input_sample_rate: int = 250  # Hz (Unicorn device rate)
    output_sample_rate: int = 125  # Hz (after downsampling)
    
    # EEG channel names (from Unicorn device)
    eeg_channels: List[str] = field(default_factory=lambda: [
        'FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8'
    ])
    
    # Rereferencing
    enable_rereferencing: bool = True
    reference_type: str = 'common_average'  # 'common_average' or 'channel'
    reference_channel: Optional[str] = None  # Used if reference_type='channel'
    
    # Notch filter (line noise removal)
    enable_notch: bool = True
    notch_freq: float = 60.0  # Hz (US power line frequency)
    notch_q: float = 30.0  # Quality factor (higher = narrower notch)
    notch_order: int = 2  # 2nd order IIR
    
    # Bandpass filters (Butterworth)
    enable_bandpass: bool = True
    bandpass_order: int = 4  # 4th order Butterworth
    
    # Alpha band (8-13 Hz)
    alpha_low: float = 8.0
    alpha_high: float = 13.0
    
    # Beta band (13-30 Hz)
    beta_low: float = 13.0
    beta_high: float = 30.0
    
    # Combined band for general filtering (covers both alpha and beta)
    combined_low: float = 8.0
    combined_high: float = 30.0
    
    # Downsampling
    enable_downsampling: bool = True
    downsample_factor: int = 2  # 250 / 2 = 125 Hz
    
    # Buffer settings for real-time processing
    filter_buffer_seconds: float = 2.0  # Seconds of data for filter state
    
    @property
    def filter_buffer_samples(self) -> int:
        return int(self.input_sample_rate * self.filter_buffer_seconds)


class FilterState:
    """Maintains filter states for real-time IIR filtering."""
    
    def __init__(self, n_channels: int, zi_shape: Tuple[int, ...]):
        """
        Initialize filter state.
        
        Parameters
        ----------
        n_channels : int
            Number of channels to filter.
        zi_shape : tuple
            Shape of the filter initial conditions.
        """
        self.zi = np.zeros((n_channels,) + zi_shape)
        self.initialized = False


class EEGPreprocessor:
    """
    Real-time EEG preprocessing pipeline.
    
    Applies the following processing steps:
    1. Rereferencing (common average reference)
    2. 60 Hz notch filter (2nd order IIR)
    3. Detrending (constant detrend to remove DC offset)
    4. Bandpass filtering (4th order Butterworth)
    5. Downsampling (250 -> 125 Hz)
    
    """
    
    def __init__(self, config: Optional[PreprocessingConfig] = None):
        """
        Initialize EEG preprocessor.
        
        Parameters
        ----------
        config : PreprocessingConfig, optional
            Configuration object. Uses defaults if not provided.
        """
        self.config = config or PreprocessingConfig()
        self._lock = threading.Lock()
        
        # Design filters
        self._notch_b, self._notch_a = self._design_notch_filter()
        self._alpha_sos = self._design_bandpass_filter(
            self.config.alpha_low, self.config.alpha_high
        )
        self._beta_sos = self._design_bandpass_filter(
            self.config.beta_low, self.config.beta_high
        )
        self._combined_sos = self._design_bandpass_filter(
            self.config.combined_low, self.config.combined_high
        )
        
        # Initialize filter states for real-time processing
        n_channels = len(self.config.eeg_channels)
        self._notch_state = self._init_notch_state(n_channels)
        self._alpha_state = self._init_sos_state(n_channels, self._alpha_sos)
        self._beta_state = self._init_sos_state(n_channels, self._beta_sos)
        self._combined_state = self._init_sos_state(n_channels, self._combined_sos)
        
        # Buffer for downsampling
        self._sample_buffer: Deque[Dict] = deque()
        self._sample_counter: int = 0
        
        # Processed output buffers (for alpha and beta separately)
        self._alpha_buffer: Deque[np.ndarray] = deque(maxlen=self.config.filter_buffer_samples)
        self._beta_buffer: Deque[np.ndarray] = deque(maxlen=self.config.filter_buffer_samples)
    
    def _design_notch_filter(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Design 2nd order IIR notch filter for 60 Hz line noise removal.
        
        Returns
        -------
        b, a : ndarray
            Numerator and denominator coefficients.
        """
        nyq = self.config.input_sample_rate / 2.0
        freq_normalized = self.config.notch_freq / nyq
        
        b, a = signal.iirnotch(
            freq_normalized,
            Q=self.config.notch_q
        )
        return b, a
    
    def _design_bandpass_filter(
        self, 
        low_freq: float, 
        high_freq: float
    ) -> np.ndarray:
        """
        Design 4th order Butterworth bandpass filter.
        
        Parameters
        ----------
        low_freq : float
            Low cutoff frequency in Hz.
        high_freq : float
            High cutoff frequency in Hz.
            
        Returns
        -------
        sos : ndarray
            Second-order sections representation.
        """
        nyq = self.config.input_sample_rate / 2.0
        low = low_freq / nyq
        high = high_freq / nyq
        
        sos = signal.butter(
            self.config.bandpass_order,
            [low, high],
            btype='band',
            output='sos'
        )
        return sos
    
    def _init_notch_state(self, n_channels: int) -> FilterState:
        """Initialize notch filter state for real-time processing."""
        zi_single = signal.lfilter_zi(self._notch_b, self._notch_a)
        state = FilterState(n_channels, zi_single.shape)
        return state
    
    def _init_sos_state(self, n_channels: int, sos: np.ndarray) -> FilterState:
        """Initialize SOS filter state for real-time processing."""
        zi_single = signal.sosfilt_zi(sos)
        state = FilterState(n_channels, zi_single.shape)
        return state
    
    def reset(self) -> None:
        """Reset all filter states and buffers."""
        with self._lock:
            n_channels = len(self.config.eeg_channels)
            self._notch_state = self._init_notch_state(n_channels)
            self._alpha_state = self._init_sos_state(n_channels, self._alpha_sos)
            self._beta_state = self._init_sos_state(n_channels, self._beta_sos)
            self._combined_state = self._init_sos_state(n_channels, self._combined_sos)
            self._sample_buffer.clear()
            self._sample_counter = 0
            self._alpha_buffer.clear()
            self._beta_buffer.clear()
    
    def rereference(self, eeg_data: np.ndarray) -> np.ndarray:
        """
        Apply rereferencing to EEG data.
        
        Parameters
        ----------
        eeg_data : ndarray
            EEG data with shape (n_channels,) or (n_samples, n_channels).
            
        Returns
        -------
        ndarray
            Rereferenced EEG data.
        """
        if not self.config.enable_rereferencing:
            return eeg_data
        
        if self.config.reference_type == 'common_average':
            # Common Average Reference (CAR)
            if eeg_data.ndim == 1:
                return eeg_data - np.mean(eeg_data)
            else:
                return eeg_data - np.mean(eeg_data, axis=1, keepdims=True)
        
        elif self.config.reference_type == 'channel':
            # Reference to specific channel
            if self.config.reference_channel is None:
                raise ValueError("reference_channel must be set when using channel reference")
            ref_idx = self.config.eeg_channels.index(self.config.reference_channel)
            if eeg_data.ndim == 1:
                return eeg_data - eeg_data[ref_idx]
            else:
                return eeg_data - eeg_data[:, ref_idx:ref_idx+1]
        
        return eeg_data
    
    def apply_notch_filter(
        self, 
        eeg_data: np.ndarray, 
        realtime: bool = False
    ) -> np.ndarray:
        """
        Apply 2nd order IIR notch filter at 60 Hz.
        
        Parameters
        ----------
        eeg_data : ndarray
            EEG data with shape (n_channels,) or (n_samples, n_channels).
        realtime : bool
            If True, maintains filter state across calls.
            
        Returns
        -------
        ndarray
            Filtered EEG data.
        """
        if not self.config.enable_notch:
            return eeg_data
        
        if realtime:
            # Single sample or small batch with state preservation
            filtered = np.zeros_like(eeg_data)
            
            if eeg_data.ndim == 1:
                for i in range(len(eeg_data)):
                    if not self._notch_state.initialized:
                        self._notch_state.zi[i] = signal.lfilter_zi(
                            self._notch_b, self._notch_a
                        ) * eeg_data[i]
                    out, self._notch_state.zi[i] = signal.lfilter(
                        self._notch_b, self._notch_a,
                        [eeg_data[i]],
                        zi=self._notch_state.zi[i]
                    )
                    filtered[i] = out[0]
                self._notch_state.initialized = True
            else:
                # Batch mode with state
                for i in range(eeg_data.shape[1]):
                    if not self._notch_state.initialized:
                        self._notch_state.zi[i] = signal.lfilter_zi(
                            self._notch_b, self._notch_a
                        ) * eeg_data[0, i]
                    filtered[:, i], self._notch_state.zi[i] = signal.lfilter(
                        self._notch_b, self._notch_a,
                        eeg_data[:, i],
                        zi=self._notch_state.zi[i]
                    )
                self._notch_state.initialized = True
            
            return filtered
        else:
            # Offline batch processing with filtfilt (zero-phase)
            if eeg_data.ndim == 1:
                return signal.filtfilt(self._notch_b, self._notch_a, eeg_data)
            else:
                return signal.filtfilt(self._notch_b, self._notch_a, eeg_data, axis=0)
    
    def apply_bandpass_filter(
        self,
        eeg_data: np.ndarray,
        band: str = 'combined',
        realtime: bool = False
    ) -> np.ndarray:
        """
        Apply 4th order Butterworth bandpass filter.
        
        Parameters
        ----------
        eeg_data : ndarray
            EEG data with shape (n_channels,) or (n_samples, n_channels).
        band : str
            'alpha' (8-13 Hz), 'beta' (13-30 Hz), or 'combined' (8-30 Hz).
        realtime : bool
            If True, maintains filter state across calls.
            
        Returns
        -------
        ndarray
            Filtered EEG data.
        """
        if not self.config.enable_bandpass:
            return eeg_data
        
        # Select filter and state
        if band == 'alpha':
            sos = self._alpha_sos
            state = self._alpha_state
        elif band == 'beta':
            sos = self._beta_sos
            state = self._beta_state
        else:  # combined
            sos = self._combined_sos
            state = self._combined_state
        
        if realtime:
            filtered = np.zeros_like(eeg_data)
            
            if eeg_data.ndim == 1:
                for i in range(len(eeg_data)):
                    if not state.initialized:
                        state.zi[i] = signal.sosfilt_zi(sos) * eeg_data[i]
                    out, state.zi[i] = signal.sosfilt(
                        sos,
                        [eeg_data[i]],
                        zi=state.zi[i]
                    )
                    filtered[i] = out[0]
                state.initialized = True
            else:
                for i in range(eeg_data.shape[1]):
                    if not state.initialized:
                        state.zi[i] = signal.sosfilt_zi(sos) * eeg_data[0, i]
                    filtered[:, i], state.zi[i] = signal.sosfilt(
                        sos,
                        eeg_data[:, i],
                        zi=state.zi[i]
                    )
                state.initialized = True
            
            return filtered
        else:
            # Offline with sosfiltfilt (zero-phase)
            if eeg_data.ndim == 1:
                return signal.sosfiltfilt(sos, eeg_data)
            else:
                return signal.sosfiltfilt(sos, eeg_data, axis=0)
    
    def downsample(self, eeg_data: np.ndarray) -> np.ndarray:
        """
        Downsample EEG data from 250 Hz to 125 Hz.
        
        Parameters
        ----------
        eeg_data : ndarray
            EEG data with shape (n_samples, n_channels).
            
        Returns
        -------
        ndarray
            Downsampled EEG data.
        """
        if not self.config.enable_downsampling:
            return eeg_data
        
        # Decimate by factor of 2 (includes anti-aliasing filter)
        if eeg_data.ndim == 1:
            return signal.decimate(eeg_data, self.config.downsample_factor, ftype='fir')
        else:
            return signal.decimate(eeg_data, self.config.downsample_factor, axis=0, ftype='fir')
    
    def process_sample(
        self,
        sample: Dict,
        output_band: str = 'combined'
    ) -> Optional[Dict]:
        """
        Process a single EEG sample in real-time.
        
        Due to downsampling, not every input sample produces an output.
        Returns None when buffering for downsampling.
        
        Parameters
        ----------
        sample : dict
            Sample dictionary with EEG channel values.
        output_band : str
            'alpha', 'beta', or 'combined' for bandpass output.
            
        Returns
        -------
        dict or None
            Processed sample or None if buffering.
        """
        with self._lock:
            # Extract EEG channels
            eeg_values = np.array([
                sample[ch] for ch in self.config.eeg_channels
            ])
            
            # 1. Rereference
            eeg_values = self.rereference(eeg_values)
            
            # 2. Notch filter (60 Hz)
            eeg_values = self.apply_notch_filter(eeg_values, realtime=True)
            
            # 3. Detrend (remove DC offset)
            eeg_values = signal.detrend(eeg_values, type='constant')
            
            # 4. Bandpass filter
            eeg_values = self.apply_bandpass_filter(
                eeg_values, band=output_band, realtime=True
            )
            
            # 5. Downsampling - accumulate samples
            self._sample_counter += 1
            
            if self.config.enable_downsampling:
                # Output every Nth sample (simple decimation after filtering)
                if self._sample_counter % self.config.downsample_factor != 0:
                    return None
            
            # Build output sample
            output = {'Time': sample.get('Time', 0)}
            for i, ch in enumerate(self.config.eeg_channels):
                output[ch] = eeg_values[i]
            
            # Copy non-EEG channels
            for key in sample:
                if key not in self.config.eeg_channels and key != 'Time':
                    output[key] = sample[key]
            
            return output
    
    def process_sample_multiband(
        self,
        sample: Dict
    ) -> Optional[Dict]:
        """
        Process a single sample and return both alpha and beta bands.
        
        Parameters
        ----------
        sample : dict
            Sample dictionary with EEG channel values.
            
        Returns
        -------
        dict or None
            Processed sample with alpha_ and beta_ prefixed channels,
            or None if buffering for downsampling.
        """
        with self._lock:
            # Extract EEG channels
            eeg_values = np.array([
                sample[ch] for ch in self.config.eeg_channels
            ])
            
            # 1. Rereference
            eeg_values = self.rereference(eeg_values)
            
            # 2. Notch filter (60 Hz)
            eeg_notched = self.apply_notch_filter(eeg_values.copy(), realtime=True)
            
            # 3. Detrend (remove DC offset)
            eeg_notched = signal.detrend(eeg_notched, type='constant')
            
            # 4. Bandpass filter - both bands
            # Note: For multiband, we need separate filter states
            # Reset to notched data for each band
            alpha_values = self.apply_bandpass_filter(
                eeg_notched.copy(), band='alpha', realtime=True
            )
            beta_values = self.apply_bandpass_filter(
                eeg_notched.copy(), band='beta', realtime=True
            )
            
            # 5. Downsampling
            self._sample_counter += 1
            
            if self.config.enable_downsampling:
                if self._sample_counter % self.config.downsample_factor != 0:
                    return None
            
            # Build output sample
            output = {'Time': sample.get('Time', 0)}
            
            # Alpha band channels
            for i, ch in enumerate(self.config.eeg_channels):
                output[f'alpha_{ch}'] = alpha_values[i]
            
            # Beta band channels
            for i, ch in enumerate(self.config.eeg_channels):
                output[f'beta_{ch}'] = beta_values[i]
            
            return output
    
    def process_batch(
        self,
        data,
        output_band: str = 'combined',
        include_time: bool = True
    ):
        """
        Process a batch of EEG data (offline processing).
        
        Uses zero-phase filtering (filtfilt) for better frequency response.
        
        Parameters
        ----------
        data : pd.DataFrame or ndarray
            Input data. If DataFrame, should have columns matching eeg_channels.
            If ndarray, shape should be (n_samples, n_channels).
        output_band : str
            'alpha', 'beta', or 'combined' for bandpass output.
        include_time : bool
            Whether to include Time column in output.
            
        Returns
        -------
        pd.DataFrame or ndarray
            Processed and downsampled EEG data.
        """
        import pandas as pd
        
        is_dataframe = isinstance(data, pd.DataFrame)
        
        if is_dataframe:
            # Extract EEG data
            eeg_data = data[self.config.eeg_channels].values
            time_data = data['Time'].values if 'Time' in data.columns else None
        else:
            eeg_data = data
            time_data = None
        
        # 1. Rereference
        eeg_data = self.rereference(eeg_data)
        
        # 2. Notch filter (60 Hz) - zero-phase
        eeg_data = self.apply_notch_filter(eeg_data, realtime=False)
        
        # 3. Detrend (remove DC offset)
        eeg_data = signal.detrend(eeg_data, type='constant', axis=0)
        
        # 4. Bandpass filter - zero-phase
        eeg_data = self.apply_bandpass_filter(
            eeg_data, band=output_band, realtime=False
        )
        
        # 5. Downsample
        eeg_data = self.downsample(eeg_data)
        
        if is_dataframe:
            result = pd.DataFrame(eeg_data, columns=self.config.eeg_channels)
            if include_time and time_data is not None:
                # Downsample time as well
                time_downsampled = time_data[::self.config.downsample_factor][:len(eeg_data)]
                result.insert(0, 'Time', time_downsampled)
            return result
        
        return eeg_data
    
    def process_batch_multiband(self, data, include_time: bool = True):
        """
        Process batch data and return both alpha and beta bands.
        
        Parameters
        ----------
        data : pd.DataFrame or ndarray
            Input EEG data.
        include_time : bool
            Whether to include Time column.
            
        Returns
        -------
        pd.DataFrame
            Processed data with alpha_ and beta_ prefixed columns.
        """
        import pandas as pd
        
        is_dataframe = isinstance(data, pd.DataFrame)
        
        if is_dataframe:
            eeg_data = data[self.config.eeg_channels].values
            time_data = data['Time'].values if 'Time' in data.columns else None
        else:
            eeg_data = data
            time_data = None
        
        # 1. Rereference
        eeg_data = self.rereference(eeg_data)
        
        # 2. Notch filter (60 Hz)
        eeg_notched = self.apply_notch_filter(eeg_data, realtime=False)
        
        # 3. Detrend (remove DC offset)
        eeg_notched = signal.detrend(eeg_notched, type='constant', axis=0)
        
        # 4. Bandpass filter - both bands
        alpha_data = self.apply_bandpass_filter(
            eeg_notched.copy(), band='alpha', realtime=False
        )
        beta_data = self.apply_bandpass_filter(
            eeg_notched.copy(), band='beta', realtime=False
        )
        
        # 5. Downsample both
        alpha_data = self.downsample(alpha_data)
        beta_data = self.downsample(beta_data)
        
        # Build result DataFrame
        result_dict = {}
        
        if include_time and time_data is not None:
            time_downsampled = time_data[::self.config.downsample_factor][:len(alpha_data)]
            result_dict['Time'] = time_downsampled
        
        for i, ch in enumerate(self.config.eeg_channels):
            result_dict[f'alpha_{ch}'] = alpha_data[:, i]
            result_dict[f'beta_{ch}'] = beta_data[:, i]
        
        return pd.DataFrame(result_dict)
    
    def get_filter_info(self) -> Dict:
        """
        Get information about the configured filters.
        
        Returns
        -------
        dict
            Dictionary with filter specifications.
        """
        return {
            'input_sample_rate': self.config.input_sample_rate,
            'output_sample_rate': self.config.output_sample_rate,
            'notch': {
                'enabled': self.config.enable_notch,
                'frequency': self.config.notch_freq,
                'order': self.config.notch_order,
                'Q': self.config.notch_q
            },
            'bandpass': {
                'enabled': self.config.enable_bandpass,
                'order': self.config.bandpass_order,
                'alpha_band': (self.config.alpha_low, self.config.alpha_high),
                'beta_band': (self.config.beta_low, self.config.beta_high),
                'combined_band': (self.config.combined_low, self.config.combined_high)
            },
            'downsampling': {
                'enabled': self.config.enable_downsampling,
                'factor': self.config.downsample_factor
            },
            'rereferencing': {
                'enabled': self.config.enable_rereferencing,
                'type': self.config.reference_type
            }
        }


# Convenience function for integration with EEGStream
def create_multiband_preprocessing_callback(
    preprocessor: Optional[EEGPreprocessor] = None,
    output_callback: Optional[callable] = None
) -> callable:
    """
    Create a multiband preprocessing callback for use with EEGStream.on_sample().
    
    This callback outputs both alpha and beta bands separately, suitable for
    use with WindowConfig(use_multiband=True) in pipe.py.
    
    Parameters
    ----------
    preprocessor : EEGPreprocessor, optional
        Preprocessor instance. Creates new one if not provided.
    output_callback : callable, optional
        Function to call with processed samples.
        
    Returns
    -------
    callable
        Callback function for EEGStream.on_sample().
        
    Examples
    --------
    >>> from unicorneeg.stream import EEGStream, EEGStreamConfig
    >>> from unicorneeg.clean import create_multiband_preprocessing_callback
    >>> from unicorneeg.pipe import RealTimeWindowBuffer, WindowConfig
    >>> 
    >>> # Setup multiband windowing
    >>> config = WindowConfig(use_multiband=True)
    >>> window_buffer = RealTimeWindowBuffer(config=config)
    >>> 
    >>> # Create chained callbacks
    >>> windowing_cb = create_windowing_callback(window_buffer)
    >>> preprocess_cb = create_multiband_preprocessing_callback(output_callback=windowing_cb)
    >>> 
    >>> stream = EEGStream(EEGStreamConfig())
    >>> stream.on_sample(preprocess_cb)
    """
    if preprocessor is None:
        preprocessor = EEGPreprocessor()
    
    def callback(sample: Dict):
        result = preprocessor.process_sample_multiband(sample)
        if result is not None and output_callback is not None:
            output_callback(result)
    
    return callback


def create_preprocessing_callback(
    preprocessor: Optional[EEGPreprocessor] = None,
    output_callback: Optional[callable] = None,
    output_band: str = 'combined'
) -> callable:
    """
    Create a preprocessing callback for use with EEGStream.on_sample().
    
    Parameters
    ----------
    preprocessor : EEGPreprocessor, optional
        Preprocessor instance. Creates new one if not provided.
    output_callback : callable, optional
        Function to call with processed samples.
    output_band : str
        'alpha', 'beta', or 'combined'.
        
    Returns
    -------
    callable
        Callback function for EEGStream.on_sample().
        
    Examples
    --------
    >>> from unicornlsl.stream import EEGStream, EEGStreamConfig
    >>> from unicornlsl.clean import create_preprocessing_callback
    >>> 
    >>> def handle_processed(sample):
    ...     print(f"Processed: {sample}")
    >>> 
    >>> callback = create_preprocessing_callback(output_callback=handle_processed)
    >>> 
    >>> config = EEGStreamConfig(use_background_thread=True)
    >>> stream = EEGStream(config)
    >>> stream.on_sample(callback)
    >>> stream.start()
    """
    if preprocessor is None:
        preprocessor = EEGPreprocessor()
    
    def callback(sample: Dict):
        result = preprocessor.process_sample(sample, output_band=output_band)
        if result is not None and output_callback is not None:
            output_callback(result)
    
    return callback


# Example usage
if __name__ == '__main__':
    import pandas as pd
    
    # Example 1: Batch processing of saved data
    print("EEG Preprocessing Module")
    print("=" * 50)
    
    preprocessor = EEGPreprocessor()
    print("\nFilter Configuration:")
    info = preprocessor.get_filter_info()
    for key, value in info.items():
        print(f"  {key}: {value}")
    
    # Example 2: Simulate real-time processing
    print("\n" + "=" * 50)
    print("Simulating real-time processing...")
    
    # Generate fake EEG data (8 channels, 250 Hz, 2 seconds)
    n_samples = 500
    t = np.arange(n_samples) / 250.0
    
    # Create test signal: 10 Hz alpha + 20 Hz beta + 60 Hz noise
    channels = ['FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8']
    test_data = {}
    test_data['Time'] = t
    
    for ch in channels:
        # Mix of alpha (10 Hz), beta (20 Hz), and line noise (60 Hz)
        test_data[ch] = (
            10 * np.sin(2 * np.pi * 10 * t) +  # Alpha
            5 * np.sin(2 * np.pi * 20 * t) +   # Beta
            3 * np.sin(2 * np.pi * 60 * t) +   # Line noise
            np.random.randn(n_samples) * 0.5   # Noise
        )
    
    df = pd.DataFrame(test_data)
    
    # Process batch
    print(f"\nInput shape: {df.shape}")
    processed = preprocessor.process_batch(df, output_band='combined')
    print(f"Output shape (combined band): {processed.shape}")
    
    processed_multiband = preprocessor.process_batch_multiband(df)
    print(f"Output shape (multiband): {processed_multiband.shape}")
    
    print("\nProcessing complete!")
