"""
Heatmap Overlay - Per-channel RMS amplitude heatmap visualization.

This module provides a color-coded heatmap display showing real-time
RMS amplitude or variance for each EEG channel.
"""

import numpy as np
from typing import List, Dict, Optional

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

import pyqtgraph as pg


class HeatmapOverlay(QWidget):
    """
    RMS amplitude heatmap display widget.
    
    Shows per-channel signal amplitude as a color-coded horizontal bar,
    with the intensity representing the RMS value over a recent window.
    
    Features:
    - Real-time RMS amplitude visualization
    - Color gradient from low (blue) to high (red)
    - Channel labels
    - Numeric value display
    """
    
    def __init__(
        self,
        channel_names: List[str],
        colors: Optional[Dict[str, str]] = None,
        parent=None
    ):
        super().__init__(parent)
        
        self.channel_names = channel_names
        self.n_channels = len(channel_names)
        self.colors = colors or {}
        
        # RMS value range for colormap (µV)
        self.rms_min = 0
        self.rms_max = 100
        
        # Current RMS values
        self.rms_values = np.zeros(self.n_channels)
        
        self._setup_ui()
    
    def _setup_ui(self):
        """Initialize the heatmap display."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)
        
        # Create graphics widget for heatmap
        self.graphics_widget = pg.GraphicsLayoutWidget()
        self.graphics_widget.setBackground(self.colors.get('background', '#1e1e2e'))
        self.graphics_widget.setMaximumHeight(80)
        layout.addWidget(self.graphics_widget)
        
        # Create image item for heatmap
        self.plot = self.graphics_widget.addPlot()
        self.plot.hideAxis('left')
        self.plot.hideAxis('bottom')
        self.plot.setMouseEnabled(x=False, y=False)
        
        # Create heatmap image
        self.heatmap_img = pg.ImageItem()
        self.plot.addItem(self.heatmap_img)
        
        # Setup colormap (viridis-like for scientific visualization)
        self.colormap = pg.colormap.get('viridis')
        self.heatmap_img.setColorMap(self.colormap)
        
        # Set initial data (1 row, n_channels columns)
        initial_data = np.zeros((1, self.n_channels))
        self.heatmap_img.setImage(initial_data, levels=(self.rms_min, self.rms_max))
        
        # Channel labels row
        labels_widget = QWidget()
        labels_layout = QHBoxLayout(labels_widget)
        labels_layout.setContentsMargins(0, 0, 0, 0)
        labels_layout.setSpacing(2)
        
        self.value_labels = []
        font = QFont()
        font.setPointSize(9)
        font.setBold(True)
        
        for i, ch_name in enumerate(self.channel_names):
            label = QLabel(f"{ch_name}\n--")
            label.setFont(font)
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            label.setStyleSheet(f"""
                color: {self.colors.get('foreground', '#cdd6f4')};
                background-color: {self.colors.get('grid', '#45475a')};
                border-radius: 4px;
                padding: 2px 4px;
            """)
            labels_layout.addWidget(label)
            self.value_labels.append(label)
        
        layout.addWidget(labels_widget)
        
        # Add colorbar legend
        self._add_colorbar()
    
    def _add_colorbar(self):
        """Add a colorbar legend to show the RMS scale."""
        # This will be shown as a small gradient bar with labels
        colorbar_widget = QWidget()
        colorbar_layout = QHBoxLayout(colorbar_widget)
        colorbar_layout.setContentsMargins(0, 0, 0, 0)
        
        # Min label
        min_label = QLabel(f"{self.rms_min}")
        min_label.setStyleSheet(f"color: {self.colors.get('foreground', '#cdd6f4')};")
        colorbar_layout.addWidget(min_label)
        
        # Gradient bar
        gradient_widget = pg.GraphicsLayoutWidget()
        gradient_widget.setBackground(self.colors.get('background', '#1e1e2e'))
        gradient_widget.setMaximumHeight(20)
        gradient_widget.setMaximumWidth(200)
        
        gradient_plot = gradient_widget.addPlot()
        gradient_plot.hideAxis('left')
        gradient_plot.hideAxis('bottom')
        gradient_plot.setMouseEnabled(x=False, y=False)
        
        gradient_data = np.linspace(self.rms_min, self.rms_max, 100).reshape(1, -1)
        gradient_img = pg.ImageItem()
        gradient_img.setImage(gradient_data, levels=(self.rms_min, self.rms_max))
        gradient_img.setColorMap(self.colormap)
        gradient_plot.addItem(gradient_img)
        
        colorbar_layout.addWidget(gradient_widget)
        
        # Max label
        max_label = QLabel(f"{self.rms_max} µV")
        max_label.setStyleSheet(f"color: {self.colors.get('foreground', '#cdd6f4')};")
        colorbar_layout.addWidget(max_label)
        
        colorbar_layout.addStretch()
        
        # Add to main layout
        self.layout().addWidget(colorbar_widget)
    
    def update_data(self, rms_values: np.ndarray):
        """
        Update the heatmap with new RMS values.
        
        Parameters
        ----------
        rms_values : np.ndarray
            Array of RMS values for each channel, shape (n_channels,).
        """
        self.rms_values = rms_values
        
        # Update heatmap image
        heatmap_data = rms_values.reshape(1, -1)
        self.heatmap_img.setImage(heatmap_data, levels=(self.rms_min, self.rms_max))
        
        # Update value labels
        for i, (label, value) in enumerate(zip(self.value_labels, rms_values)):
            ch_name = self.channel_names[i]
            label.setText(f"{ch_name}\n{value:.1f}")
            
            # Color-code based on value
            if value < 15:
                bg_color = self.colors.get('good', '#a6e3a1')
            elif value < 40:
                bg_color = self.colors.get('moderate', '#f9e2af')
            elif value < 80:
                bg_color = self.colors.get('poor', '#fab387')
            else:
                bg_color = self.colors.get('bad', '#f38ba8')
            
            label.setStyleSheet(f"""
                color: {self.colors.get('background', '#1e1e2e')};
                background-color: {bg_color};
                border-radius: 4px;
                padding: 2px 4px;
                font-weight: bold;
            """)
    
    def set_rms_range(self, rms_min: float, rms_max: float):
        """Set the RMS value range for the colormap."""
        self.rms_min = rms_min
        self.rms_max = rms_max
        self.heatmap_img.setImage(
            self.rms_values.reshape(1, -1), 
            levels=(rms_min, rms_max)
        )
    
    def clear(self):
        """Clear the heatmap display."""
        self.rms_values = np.zeros(self.n_channels)
        self.update_data(self.rms_values)


class RollingVarianceOverlay:
    """
    Helper class to compute rolling variance for heatmap overlay.
    
    Computes variance over sliding windows to show amplitude variation
    over time for each channel.
    """
    
    def __init__(
        self,
        n_channels: int,
        window_samples: int = 250,  # 1 second at 250 Hz
        n_windows: int = 10  # Number of historical windows to display
    ):
        self.n_channels = n_channels
        self.window_samples = window_samples
        self.n_windows = n_windows
        
        # Rolling variance buffer
        self.variance_history = np.zeros((n_channels, n_windows))
        self._current_idx = 0
    
    def update(self, data: np.ndarray) -> np.ndarray:
        """
        Update rolling variance with new data.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data array of shape (n_channels, n_samples).
            
        Returns
        -------
        np.ndarray
            Variance history array of shape (n_channels, n_windows).
        """
        if data.shape[1] < self.window_samples:
            return self.variance_history
        
        # Compute variance over the latest window
        variance = np.var(data[:, -self.window_samples:], axis=1)
        
        # Store in history
        self.variance_history[:, self._current_idx % self.n_windows] = variance
        self._current_idx += 1
        
        return self.variance_history
    
    def get_current_variance(self) -> np.ndarray:
        """Get the most recent variance values."""
        if self._current_idx == 0:
            return np.zeros(self.n_channels)
        
        idx = (self._current_idx - 1) % self.n_windows
        return self.variance_history[:, idx]
    
    def get_mean_variance(self) -> np.ndarray:
        """Get the mean variance over all stored windows."""
        if self._current_idx == 0:
            return np.zeros(self.n_channels)
        
        n_filled = min(self._current_idx, self.n_windows)
        return np.mean(self.variance_history[:, :n_filled], axis=1)
    
    def reset(self):
        """Reset the variance history."""
        self.variance_history.fill(0)
        self._current_idx = 0
