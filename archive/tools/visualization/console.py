"""
EEG Visualization Console - Main console window for real-time EEG visualization.

This module provides a polished PyQt6-based visualization console that integrates
multiple visualization widgets for comprehensive EEG monitoring.
"""

import sys
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Deque, Callable
from collections import deque
import threading
import time

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QComboBox, QGroupBox, QSplitter, QFrame,
    QStatusBar, QToolBar, QCheckBox, QSlider, QSpinBox,
    QProgressBar, QMessageBox
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QThread
from PyQt6.QtGui import QAction, QFont, QPalette, QColor

import pyqtgraph as pg

# Enable antialiasing for pyqtgraph
pg.setConfigOptions(antialias=True, useOpenGL=True)


# MNE channel positions for Unicorn EEG (standard 10-20 system)
# Using approximate 2D positions for topographic mapping
UNICORN_CHANNEL_INFO = {
    'FZ':  {'idx': 0, 'pos': (0.0, 0.5),    'region': 'frontal'},
    'C3':  {'idx': 1, 'pos': (-0.4, 0.0),   'region': 'central'},
    'CZ':  {'idx': 2, 'pos': (0.0, 0.0),    'region': 'central'},
    'C4':  {'idx': 3, 'pos': (0.4, 0.0),    'region': 'central'},
    'PZ':  {'idx': 4, 'pos': (0.0, -0.35),  'region': 'parietal'},
    'PO7': {'idx': 5, 'pos': (-0.35, -0.6), 'region': 'occipital'},
    'OZ':  {'idx': 6, 'pos': (0.0, -0.7),   'region': 'occipital'},
    'PO8': {'idx': 7, 'pos': (0.35, -0.6),  'region': 'occipital'},
}


@dataclass
class VisualizationConfig:
    """Configuration for EEG visualization console."""
    
    # Window settings
    window_title: str = "Thalis EEG Visualization Console"
    window_width: int = 1600
    window_height: int = 900
    
    # Channel configuration
    channel_names: List[str] = field(default_factory=lambda: [
        'FZ', 'C3', 'CZ', 'C4', 'PZ', 'PO7', 'OZ', 'PO8'
    ])
    sample_rate: int = 250  # Hz
    
    # Time series settings
    display_seconds: float = 10.0  # Seconds of data to display
    y_range: tuple = (-150, 150)  # µV range for EEG
    
    # Update rates
    plot_update_rate: int = 30  # Hz (target frame rate)
    quality_update_rate: int = 2  # Hz (quality indicators)
    topomap_update_rate: int = 4  # Hz (topographic map)
    
    # Signal emission batching (to reduce Qt event queue pressure)
    # At 250 Hz sample rate with batch_size=5, signals are emitted at 50 Hz
    # Higher batch_size = less frequent updates = better performance
    signal_batch_size: int = 5  # Emit signal every N samples
    
    # Band definitions for band power calculation
    bands: Dict[str, tuple] = field(default_factory=lambda: {
        'delta': (1, 4),
        'theta': (4, 8),
        'alpha': (8, 13),
        'beta': (13, 30),
        'gamma': (30, 50),
    })
    
    # Signal quality thresholds
    quality_thresholds: Dict[str, float] = field(default_factory=lambda: {
        'good': 10.0,      # RMS < 10 µV: good signal
        'moderate': 30.0,  # RMS < 30 µV: moderate
        'poor': 100.0,     # RMS < 100 µV: poor, above is bad
    })
    
    # Color scheme
    colors: Dict[str, str] = field(default_factory=lambda: {
        'background': '#1e1e2e',
        'foreground': '#cdd6f4',
        'accent': '#89b4fa',
        'good': '#a6e3a1',
        'moderate': '#f9e2af',
        'poor': '#fab387',
        'bad': '#f38ba8',
        'grid': '#45475a',
    })
    
    @property
    def buffer_samples(self) -> int:
        """Number of samples in the display buffer."""
        return int(self.sample_rate * self.display_seconds)


class DataBuffer:
    """Thread-safe circular buffer for EEG data storage."""
    
    def __init__(self, n_channels: int, max_samples: int):
        self.n_channels = n_channels
        self.max_samples = max_samples
        self._data = np.zeros((n_channels, max_samples))
        self._timestamps = np.zeros(max_samples)
        self._write_idx = 0
        self._sample_count = 0
        self._lock = threading.Lock()
        
        # Filtered data buffer (same size)
        self._filtered_data = np.zeros((n_channels, max_samples))
        
    def add_sample(self, sample: np.ndarray, timestamp: float):
        """Add a single sample (n_channels,) to the buffer."""
        with self._lock:
            idx = self._write_idx % self.max_samples
            self._data[:, idx] = sample
            self._timestamps[idx] = timestamp
            self._write_idx += 1
            self._sample_count = min(self._sample_count + 1, self.max_samples)
    
    def add_samples(self, samples: np.ndarray, timestamps: np.ndarray):
        """Add multiple samples (n_channels, n_samples) to the buffer."""
        with self._lock:
            n_samples = samples.shape[1]
            for i in range(n_samples):
                idx = (self._write_idx + i) % self.max_samples
                self._data[:, idx] = samples[:, i]
                self._timestamps[idx] = timestamps[i]
            self._write_idx += n_samples
            self._sample_count = min(self._sample_count + n_samples, self.max_samples)
    
    def add_filtered_sample(self, sample: np.ndarray, timestamp: float):
        """Add a filtered sample to the filtered buffer."""
        with self._lock:
            # Find the index based on timestamp matching
            idx = (self._write_idx - 1) % self.max_samples
            self._filtered_data[:, idx] = sample
    
    def get_data(self, n_samples: Optional[int] = None) -> tuple:
        """Get data in chronological order."""
        with self._lock:
            if self._sample_count == 0:
                return np.zeros((self.n_channels, 0)), np.zeros(0)
            
            n = n_samples or self._sample_count
            n = min(n, self._sample_count)
            
            # Get data in chronological order
            if self._sample_count < self.max_samples:
                data = self._data[:, :self._sample_count].copy()
                times = self._timestamps[:self._sample_count].copy()
            else:
                start_idx = self._write_idx % self.max_samples
                indices = [(start_idx + i) % self.max_samples for i in range(self.max_samples)]
                data = self._data[:, indices].copy()
                times = self._timestamps[indices].copy()
            
            return data[:, -n:], times[-n:]
    
    def get_filtered_data(self, n_samples: Optional[int] = None) -> tuple:
        """Get filtered data in chronological order."""
        with self._lock:
            if self._sample_count == 0:
                return np.zeros((self.n_channels, 0)), np.zeros(0)
            
            n = n_samples or self._sample_count
            n = min(n, self._sample_count)
            
            if self._sample_count < self.max_samples:
                data = self._filtered_data[:, :self._sample_count].copy()
                times = self._timestamps[:self._sample_count].copy()
            else:
                start_idx = self._write_idx % self.max_samples
                indices = [(start_idx + i) % self.max_samples for i in range(self.max_samples)]
                data = self._filtered_data[:, indices].copy()
                times = self._timestamps[indices].copy()
            
            return data[:, -n:], times[-n:]
    
    def get_latest(self, n_samples: int = 1) -> tuple:
        """Get the most recent n samples."""
        return self.get_data(n_samples)
    
    def clear(self):
        """Clear the buffer."""
        with self._lock:
            self._data.fill(0)
            self._filtered_data.fill(0)
            self._timestamps.fill(0)
            self._write_idx = 0
            self._sample_count = 0


class EEGVisualizationConsole(QMainWindow):
    """
    Main visualization console window for real-time EEG monitoring.
    
    Integrates:
    - Multi-channel time series display (raw/filtered)
    - RMS amplitude heatmap overlay
    - Per-channel signal quality indicators
    - Topographic scalp map of band power
    """
    
    # Signal for thread-safe data updates
    data_received = pyqtSignal(dict)
    
    def __init__(self, config: Optional[VisualizationConfig] = None, parent=None):
        super().__init__(parent)
        
        self.config = config or VisualizationConfig()
        self.n_channels = len(self.config.channel_names)
        
        # Data buffer
        self.data_buffer = DataBuffer(
            n_channels=self.n_channels,
            max_samples=self.config.buffer_samples
        )
        
        # State
        self._show_filtered = False
        self._selected_band = 'alpha'
        self._running = False
        self._start_time = None
        self._battery_level = 100  # Battery percentage
        self._stop_callback = None  # Callback to stop the stream
        self._burn_in_complete = False  # Track if burn-in period is done
        
        # Batched signal emission to reduce Qt event queue pressure
        # At 250 Hz, batch_size=5 means emit signals at 50 Hz (every 20ms)
        self._sample_batch: List[dict] = []
        self._batch_size = self.config.signal_batch_size
        
        # Setup UI
        self._setup_ui()
        self._setup_timers()
        
        # Connect signals
        self.data_received.connect(self._handle_data)
    
    def _setup_ui(self):
        """Initialize the user interface."""
        self.setWindowTitle(self.config.window_title)
        self.resize(self.config.window_width, self.config.window_height)
        
        # Apply dark theme
        self._apply_theme()
        
        # Central widget with main layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(8)
        
        # Toolbar
        self._create_toolbar()
        
        # Main content area with splitter
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # Left panel: Time series + heatmap
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        
        # Time series widget
        self.time_series_widget = self._create_time_series_widget()
        left_layout.addWidget(self.time_series_widget, stretch=4)
        
        # Heatmap widget
        self.heatmap_widget = self._create_heatmap_widget()
        left_layout.addWidget(self.heatmap_widget, stretch=1)
        
        splitter.addWidget(left_panel)
        
        # Right panel: Quality indicators + Topomap
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        
        # Signal quality widget
        self.quality_widget = self._create_quality_widget()
        right_layout.addWidget(self.quality_widget, stretch=1)
        
        # Topomap widget
        self.topomap_widget = self._create_topomap_widget()
        right_layout.addWidget(self.topomap_widget, stretch=2)
        
        splitter.addWidget(right_panel)
        
        # Set splitter proportions (70/30)
        splitter.setSizes([1100, 500])
        
        main_layout.addWidget(splitter)
        
        # Status bar
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self._update_status("Ready - Waiting for EEG stream...")
    
    def _apply_theme(self):
        """Apply dark theme styling."""
        colors = self.config.colors
        self.setStyleSheet(f"""
            QMainWindow {{
                background-color: {colors['background']};
            }}
            QWidget {{
                background-color: {colors['background']};
                color: {colors['foreground']};
                font-family: 'SF Pro Display', 'Segoe UI', sans-serif;
            }}
            QGroupBox {{
                border: 1px solid {colors['grid']};
                border-radius: 6px;
                margin-top: 12px;
                padding-top: 8px;
                font-weight: bold;
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }}
            QPushButton {{
                background-color: {colors['accent']};
                color: {colors['background']};
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background-color: #b4befe;
            }}
            QPushButton:pressed {{
                background-color: #7287fd;
            }}
            QPushButton:checked {{
                background-color: #a6e3a1;
            }}
            QComboBox {{
                background-color: {colors['grid']};
                border: 1px solid {colors['grid']};
                border-radius: 4px;
                padding: 4px 8px;
            }}
            QComboBox:drop-down {{
                border: none;
            }}
            QCheckBox {{
                spacing: 8px;
            }}
            QCheckBox::indicator {{
                width: 18px;
                height: 18px;
            }}
            QSlider::groove:horizontal {{
                height: 6px;
                background: {colors['grid']};
                border-radius: 3px;
            }}
            QSlider::handle:horizontal {{
                width: 16px;
                margin: -5px 0;
                background: {colors['accent']};
                border-radius: 8px;
            }}
            QStatusBar {{
                background-color: {colors['grid']};
                color: {colors['foreground']};
            }}
            QToolBar {{
                background-color: {colors['background']};
                border: none;
                spacing: 8px;
                padding: 4px;
            }}
        """)
    
    def _create_toolbar(self):
        """Create the main toolbar."""
        toolbar = QToolBar("Main Toolbar")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        
        # Display mode toggle
        toolbar.addWidget(QLabel("Display: "))
        self.filter_toggle = QCheckBox("Show Filtered")
        self.filter_toggle.setChecked(False)
        self.filter_toggle.toggled.connect(self._toggle_filter_display)
        toolbar.addWidget(self.filter_toggle)
        
        toolbar.addSeparator()
        
        # Band selection for topomap
        toolbar.addWidget(QLabel("Band Power: "))
        self.band_selector = QComboBox()
        self.band_selector.addItems(['alpha', 'beta', 'theta', 'delta', 'gamma'])
        self.band_selector.currentTextChanged.connect(self._change_band)
        toolbar.addWidget(self.band_selector)
        
        toolbar.addSeparator()
        
        # Time window
        toolbar.addWidget(QLabel("Time Window: "))
        self.time_window_spin = QSpinBox()
        self.time_window_spin.setRange(2, 30)
        self.time_window_spin.setValue(int(self.config.display_seconds))
        self.time_window_spin.setSuffix(" s")
        self.time_window_spin.valueChanged.connect(self._change_time_window)
        toolbar.addWidget(self.time_window_spin)
        
        toolbar.addSeparator()
        
        # Y-axis scale
        toolbar.addWidget(QLabel("Y Scale: "))
        self.y_scale_slider = QSlider(Qt.Orientation.Horizontal)
        self.y_scale_slider.setRange(50, 500)
        self.y_scale_slider.setValue(150)
        self.y_scale_slider.setFixedWidth(100)
        self.y_scale_slider.valueChanged.connect(self._change_y_scale)
        toolbar.addWidget(self.y_scale_slider)
        
        toolbar.addSeparator()
        
        # Spacer to push controls to the right
        spacer = QWidget()
        spacer.setSizePolicy(spacer.sizePolicy().horizontalPolicy(), spacer.sizePolicy().verticalPolicy())
        from PyQt6.QtWidgets import QSizePolicy
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        toolbar.addWidget(spacer)
        
        # Battery indicator
        self._create_battery_indicator(toolbar)
        
        toolbar.addSeparator()
        
        # Stop button
        self.stop_btn = QPushButton("⏹ Stop Stream")
        self.stop_btn.setToolTip("Stop the EEG stream and data collection")
        self.stop_btn.clicked.connect(self._stop_stream)
        self.stop_btn.setStyleSheet("""
            QPushButton {
                background-color: #f38ba8;
                color: #1e1e2e;
                font-weight: bold;
                padding: 6px 12px;
            }
            QPushButton:hover {
                background-color: #eba0ac;
            }
            QPushButton:disabled {
                background-color: #45475a;
                color: #6c7086;
            }
        """)
        toolbar.addWidget(self.stop_btn)
        
        toolbar.addSeparator()
        
        # Recording indicator
        self.recording_label = QLabel("● LIVE")
        self.recording_label.setStyleSheet(f"color: {self.config.colors['good']}; font-weight: bold;")
        toolbar.addWidget(self.recording_label)
    
    def _create_battery_indicator(self, toolbar: QToolBar):
        """Create battery indicator widget."""
        # Battery container
        battery_container = QWidget()
        battery_layout = QHBoxLayout(battery_container)
        battery_layout.setContentsMargins(4, 0, 4, 0)
        battery_layout.setSpacing(6)
        
        # Battery icon label
        self.battery_icon = QLabel("🔋")
        self.battery_icon.setStyleSheet("font-size: 16px;")
        battery_layout.addWidget(self.battery_icon)
        
        # Battery percentage label
        self.battery_label = QLabel("---%")
        self.battery_label.setMinimumWidth(45)
        self.battery_label.setStyleSheet(f"color: {self.config.colors['good']}; font-weight: bold;")
        battery_layout.addWidget(self.battery_label)
        
        # Battery progress bar
        self.battery_bar = QProgressBar()
        self.battery_bar.setRange(0, 100)
        self.battery_bar.setValue(100)
        self.battery_bar.setFixedWidth(60)
        self.battery_bar.setFixedHeight(16)
        self.battery_bar.setTextVisible(False)
        self.battery_bar.setStyleSheet(f"""
            QProgressBar {{
                border: 1px solid {self.config.colors['grid']};
                border-radius: 4px;
                background-color: {self.config.colors['grid']};
            }}
            QProgressBar::chunk {{
                background-color: {self.config.colors['good']};
                border-radius: 3px;
            }}
        """)
        battery_layout.addWidget(self.battery_bar)
        
        toolbar.addWidget(battery_container)
    
    def _create_time_series_widget(self) -> QGroupBox:
        """Create the multi-channel time series plot widget."""
        from .time_series import TimeSeriesWidget
        
        group = QGroupBox("Multi-Channel EEG Time Series")
        layout = QVBoxLayout(group)
        layout.setContentsMargins(4, 4, 4, 4)
        
        self.time_series_plot = TimeSeriesWidget(
            channel_names=self.config.channel_names,
            sample_rate=self.config.sample_rate,
            display_seconds=self.config.display_seconds,
            y_range=self.config.y_range,
            colors=self.config.colors
        )
        layout.addWidget(self.time_series_plot)
        
        return group
    
    def _create_heatmap_widget(self) -> QGroupBox:
        """Create the RMS amplitude heatmap widget."""
        from .heatmap import HeatmapOverlay
        
        group = QGroupBox("Channel RMS Amplitude")
        layout = QVBoxLayout(group)
        layout.setContentsMargins(4, 4, 4, 4)
        
        self.heatmap_plot = HeatmapOverlay(
            channel_names=self.config.channel_names,
            colors=self.config.colors
        )
        layout.addWidget(self.heatmap_plot)
        
        return group
    
    def _create_quality_widget(self) -> QGroupBox:
        """Create the signal quality indicator widget."""
        from .quality import SignalQualityWidget
        
        group = QGroupBox("Signal Quality")
        layout = QVBoxLayout(group)
        layout.setContentsMargins(4, 4, 4, 4)
        
        self.quality_plot = SignalQualityWidget(
            channel_names=self.config.channel_names,
            thresholds=self.config.quality_thresholds,
            colors=self.config.colors
        )
        layout.addWidget(self.quality_plot)
        
        return group
    
    def _create_topomap_widget(self) -> QGroupBox:
        """Create the topographic scalp map widget."""
        from .topomap import TopomapWidget
        
        group = QGroupBox("Topographic Band Power Map")
        layout = QVBoxLayout(group)
        layout.setContentsMargins(4, 4, 4, 4)
        
        self.topomap_plot = TopomapWidget(
            channel_names=self.config.channel_names,
            channel_info=UNICORN_CHANNEL_INFO,
            colors=self.config.colors
        )
        layout.addWidget(self.topomap_plot)
        
        return group
    
    def _setup_timers(self):
        """Setup update timers for different components."""
        # Main plot update timer
        self.plot_timer = QTimer()
        self.plot_timer.timeout.connect(self._update_plots)
        self.plot_timer.setInterval(int(1000 / self.config.plot_update_rate))
        
        # Quality indicator timer (slower update)
        self.quality_timer = QTimer()
        self.quality_timer.timeout.connect(self._update_quality)
        self.quality_timer.setInterval(int(1000 / self.config.quality_update_rate))
        
        # Topomap timer (slower update)
        self.topomap_timer = QTimer()
        self.topomap_timer.timeout.connect(self._update_topomap)
        self.topomap_timer.setInterval(int(1000 / self.config.topomap_update_rate))
    
    def _toggle_filter_display(self, checked: bool):
        """Toggle between raw and filtered data display."""
        self._show_filtered = checked
        self.time_series_plot.set_show_filtered(checked)
    
    def _change_band(self, band: str):
        """Change the selected band for topomap display."""
        self._selected_band = band
        self.topomap_plot.set_band(band)
    
    def _change_time_window(self, seconds: int):
        """Change the time window for display."""
        self.config.display_seconds = float(seconds)
        self.time_series_plot.set_display_seconds(seconds)
    
    def _change_y_scale(self, value: int):
        """Change the Y-axis scale."""
        self.time_series_plot.set_y_range((-value, value))
    
    def _update_battery(self, level: float):
        """Update the battery indicator with new level."""
        # Convert to percentage (0-100)
        level = max(0, min(100, level))
        self._battery_level = level
        
        # Update label
        self.battery_label.setText(f"{int(level)}%")
        
        # Update progress bar
        self.battery_bar.setValue(int(level))
        
        # Update colors based on level
        if level >= 50:
            color = self.config.colors['good']
            icon = "🔋"
        elif level >= 20:
            color = self.config.colors['moderate']
            icon = "🔋"
        else:
            color = self.config.colors['bad']
            icon = "🪫"
        
        self.battery_label.setStyleSheet(f"color: {color}; font-weight: bold;")
        self.battery_icon.setText(icon)
        self.battery_bar.setStyleSheet(f"""
            QProgressBar {{
                border: 1px solid {self.config.colors['grid']};
                border-radius: 4px;
                background-color: {self.config.colors['grid']};
            }}
            QProgressBar::chunk {{
                background-color: {color};
                border-radius: 3px;
            }}
        """)
    
    def _stop_stream(self):
        """Stop the EEG stream."""
        reply = QMessageBox.question(
            self,
            "Stop Stream",
            "Are you sure you want to stop the EEG stream?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # Update UI
            self.stop_btn.setEnabled(False)
            self.recording_label.setText("● STOPPED")
            self.recording_label.setStyleSheet(f"color: {self.config.colors['bad']}; font-weight: bold;")
            
            # Call stop callback if set (this triggers EEGStream.stop → CSV close)
            if self._stop_callback is not None:
                self._stop_callback()
            
            self._update_status("Stream stopped.")
    
    def set_stop_callback(self, callback: Callable):
        """
        Set a callback function to be called when stop button is pressed.
        
        Parameters
        ----------
        callback : callable
            Function to call when stopping the stream.
        """
        self._stop_callback = callback

    def _handle_data(self, sample: dict):
        """Handle incoming data (called from signal). Visualization only — no CSV."""
        # Extract EEG channels
        eeg_data = np.array([
            sample.get(ch, 0.0) for ch in self.config.channel_names
        ])
        timestamp = sample.get('Time', time.time())
        
        # Add to visualization buffer
        self.data_buffer.add_sample(eeg_data, timestamp)
        
        # Update battery level
        battery = sample.get('Battery', None)
        if battery is not None:
            self._update_battery(battery)
    
    def _update_plots(self):
        """Update the time series and heatmap plots."""
        if not self._running:
            return
        
        # Get data from buffer
        if self._show_filtered:
            data, times = self.data_buffer.get_filtered_data()
        else:
            data, times = self.data_buffer.get_data()
        
        if data.shape[1] == 0:
            return
        
        # Update time series
        self.time_series_plot.update_data(data, times)
        
        # Update heatmap with RMS values
        rms_values = np.sqrt(np.mean(data[:, -250:]**2, axis=1))  # Last 1 second
        self.heatmap_plot.update_data(rms_values)
    
    def _update_quality(self):
        """Update signal quality indicators."""
        if not self._running:
            return
        
        data, _ = self.data_buffer.get_data(n_samples=500)  # Last 2 seconds
        if data.shape[1] < 100:
            return
        
        # Calculate quality metrics
        self.quality_plot.update_data(data)
    
    def _update_topomap(self):
        """Update topographic map."""
        if not self._running:
            return
        
        data, _ = self.data_buffer.get_data(n_samples=500)  # Last 2 seconds
        if data.shape[1] < 250:
            return
        
        # Calculate band power and update topomap
        self.topomap_plot.update_data(
            data, 
            sample_rate=self.config.sample_rate,
            band=self._selected_band,
            band_freqs=self.config.bands[self._selected_band]
        )
    
    def _update_status(self, message: str):
        """Update status bar message."""
        self.status_bar.showMessage(message)
    
    def create_sample_callback(self):
        """
        Create a callback function for EEGStream.on_sample().
        
        Uses batched signal emission to reduce Qt event queue pressure.
        At 250 Hz sample rate with batch_size=5, signals are emitted at 50 Hz.
        
        Returns
        -------
        callable
            Callback function that adds samples to the visualization.
        """
        def callback(sample: dict):
            # Add sample to batch
            self._sample_batch.append(sample)
            
            # Emit signal when batch is full
            if len(self._sample_batch) >= self._batch_size:
                # Process all samples in batch
                for s in self._sample_batch:
                    self.data_received.emit(s)
                # Clear batch
                self._sample_batch.clear()
        
        return callback
    
    def add_filtered_sample(self, sample: dict):
        """
        Add a filtered sample to the visualization.
        
        Parameters
        ----------
        sample : dict
            Dictionary with channel names as keys.
        """
        eeg_data = np.array([
            sample.get(ch, 0.0) for ch in self.config.channel_names
        ])
        timestamp = sample.get('Time', time.time())
        self.data_buffer.add_filtered_sample(eeg_data, timestamp)
    
    def start(self):
        """Start the visualization timers."""
        self._running = True
        self._start_time = time.time()
        self.plot_timer.start()
        self.quality_timer.start()
        self.topomap_timer.start()
        self._update_status("Streaming EEG data...")
    
    def stop(self):
        """Stop the visualization timers."""
        self._running = False
        
        # Flush any remaining samples in signal batch
        self._flush_sample_batch()
        
        self.plot_timer.stop()
        self.quality_timer.stop()
        self.topomap_timer.stop()
        self._update_status("Stopped")
    
    def _flush_sample_batch(self):
        """Flush any remaining samples in the batch buffer."""
        if self._sample_batch:
            for s in self._sample_batch:
                self.data_received.emit(s)
            self._sample_batch.clear()
    
    def reset(self):
        """Reset the visualization (clear buffers)."""
        self.data_buffer.clear()
        self.time_series_plot.clear()
        self.heatmap_plot.clear()
        self.quality_plot.clear()
        self.topomap_plot.clear()
    
    def set_burn_in_complete(self, complete: bool = True):
        """
        Mark burn-in period as complete.
        
        Parameters
        ----------
        complete : bool
            Whether burn-in is complete (default: True)
        """
        self._burn_in_complete = complete
        if complete:
            self._update_status("Burn-in complete. Recording data...")
    
    def closeEvent(self, event):
        """Handle window close event."""
        self.stop()
        event.accept()


def launch_console(config: Optional[VisualizationConfig] = None) -> tuple:
    """
    Launch the visualization console application.
    
    Parameters
    ----------
    config : VisualizationConfig, optional
        Configuration for the console.
        
    Returns
    -------
    tuple
        (QApplication, EEGVisualizationConsole) instances.
    """
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    console = EEGVisualizationConsole(config)
    console.show()
    
    return app, console
