"""
Time Series Widget - Multi-channel scrolling EEG time series display.

This module provides a high-performance stacked time series display
using pyqtgraph for real-time EEG visualization with support for
both raw and filtered data display.
"""

import numpy as np
from typing import List, Dict, Optional

from PyQt6.QtWidgets import QWidget, QVBoxLayout
from PyQt6.QtCore import Qt

import pyqtgraph as pg


# Channel colors (categorical colorblind-safe palette)
CHANNEL_COLORS = [
    '#89b4fa',  # Blue - FZ
    '#f5c2e7',  # Pink - C3
    '#a6e3a1',  # Green - CZ
    '#fab387',  # Peach - C4
    '#94e2d5',  # Teal - PZ
    '#f9e2af',  # Yellow - PO7
    '#cba6f7',  # Mauve - OZ
    '#f38ba8',  # Red - PO8
]


class TimeSeriesWidget(QWidget):
    """
    Multi-channel stacked time series display widget.
    
    Features:
    - Stacked horizontal scrolling traces
    - Smooth real-time updates using pyqtgraph
    - Toggle between raw and filtered data
    - Per-channel coloring
    - Grid overlay with time markers
    - Amplitude scale bar
    """
    
    def __init__(
        self,
        channel_names: List[str],
        sample_rate: int = 250,
        display_seconds: float = 10.0,
        y_range: tuple = (-150, 150),
        colors: Optional[Dict[str, str]] = None,
        parent=None
    ):
        super().__init__(parent)
        
        self.channel_names = channel_names
        self.n_channels = len(channel_names)
        self.sample_rate = sample_rate
        self.display_seconds = display_seconds
        self.y_range = y_range
        self.colors = colors or {}
        
        self._show_filtered = False
        
        # Calculate channel spacing (µV between channel baselines)
        # Each channel needs enough vertical space for its signal range
        y_span = y_range[1] - y_range[0]  # e.g., 300 µV for (-150, 150)
        self._channel_offset = y_span  # Offset between channel baselines
        
        self._setup_ui()
    
    def _setup_ui(self):
        """Initialize the time series plot."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        
        # Create graphics layout widget
        self.graphics_widget = pg.GraphicsLayoutWidget()
        self.graphics_widget.setBackground(self.colors.get('background', '#1e1e2e'))
        layout.addWidget(self.graphics_widget)
        
        # Create the main plot
        self.plot = self.graphics_widget.addPlot()
        self.plot.setLabel('bottom', 'Time', units='s')
        self.plot.setLabel('left', 'Channels')
        
        # Configure axes
        self.plot.showGrid(x=True, y=True, alpha=0.3)
        self.plot.setXRange(0, self.display_seconds, padding=0)
        
        # Calculate Y range to fit all channels
        # Each channel is centered at i * _channel_offset
        # Total range needs to accommodate all channels plus their signal amplitude
        y_min = self.y_range[0]  # Bottom of first channel
        y_max = (self.n_channels - 1) * self._channel_offset + self.y_range[1]  # Top of last channel
        self.plot.setYRange(y_min - 50, y_max + 50, padding=0.02)
        
        # Custom Y-axis with channel labels
        self._setup_channel_labels()
        
        # Create plot curves for each channel
        self.curves = []
        for i, ch_name in enumerate(self.channel_names):
            color = CHANNEL_COLORS[i % len(CHANNEL_COLORS)]
            curve = self.plot.plot(
                pen=pg.mkPen(color=color, width=1.5),
                name=ch_name
            )
            self.curves.append(curve)
        
        # Time indicator line (vertical line showing current position)
        self.time_line = pg.InfiniteLine(
            pos=0, 
            angle=90, 
            pen=pg.mkPen(color='#f38ba8', width=2, style=Qt.PenStyle.DashLine)
        )
        self.plot.addItem(self.time_line)
        
        # Add scale bar
        self._add_scale_bar()
    
    def _setup_channel_labels(self):
        """Setup custom Y-axis with channel name labels."""
        # Create custom tick positions and labels
        ticks = []
        for i, ch_name in enumerate(self.channel_names):
            y_pos = i * self._channel_offset + (self.y_range[0] + self.y_range[1]) / 2
            ticks.append((y_pos, ch_name))
        
        # Set custom ticks on left axis
        left_axis = self.plot.getAxis('left')
        left_axis.setTicks([ticks])
        left_axis.setStyle(tickLength=0)
        left_axis.setTextPen(pg.mkPen(color=self.colors.get('foreground', '#cdd6f4')))
    
    def _add_scale_bar(self):
        """Add amplitude scale bar to the plot."""
        # Scale bar showing 100 µV
        scale_bar_x = self.display_seconds - 1.0
        scale_bar_y = self.y_range[0] - 30
        
        # Vertical line (100 µV)
        self.scale_bar = pg.PlotDataItem(
            x=[scale_bar_x, scale_bar_x],
            y=[scale_bar_y, scale_bar_y + 100],
            pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=2)
        )
        self.plot.addItem(self.scale_bar)
        
        # Scale bar label
        self.scale_label = pg.TextItem(
            text='100 µV',
            color=self.colors.get('foreground', '#cdd6f4'),
            anchor=(0, 0.5)
        )
        self.scale_label.setPos(scale_bar_x + 0.1, scale_bar_y + 50)
        self.plot.addItem(self.scale_label)
    
    def update_data(self, data: np.ndarray, times: np.ndarray):
        """
        Update the time series display with new data.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data array of shape (n_channels, n_samples).
        times : np.ndarray
            Timestamp array of shape (n_samples,).
        """
        if data.shape[1] == 0:
            return
        
        # Calculate relative time from start
        t_start = times[0]
        t_rel = times - t_start
        
        # Update X range to scroll with data
        t_max = t_rel[-1]
        if t_max > self.display_seconds:
            self.plot.setXRange(t_max - self.display_seconds, t_max, padding=0)
        else:
            self.plot.setXRange(0, self.display_seconds, padding=0)
        
        # Update each channel curve with offset
        for i, curve in enumerate(self.curves):
            # Remove mean (DC offset) from each channel to center around 0
            # This is essential for stacked display since raw EEG values can have large DC offsets
            channel_data = data[i, :]
            channel_mean = np.mean(channel_data)
            centered_data = channel_data - channel_mean
            
            # Apply vertical offset for stacked display
            y_offset = i * self._channel_offset
            y_data = centered_data + y_offset
            curve.setData(t_rel, y_data)
        
        # Update time indicator line
        self.time_line.setPos(t_max)
    
    def set_show_filtered(self, show_filtered: bool):
        """Toggle display between raw and filtered data."""
        self._show_filtered = show_filtered
        
        # Update curve styles to indicate filtered mode
        for i, curve in enumerate(self.curves):
            color = CHANNEL_COLORS[i % len(CHANNEL_COLORS)]
            if show_filtered:
                # Filtered: thicker line
                curve.setPen(pg.mkPen(color=color, width=2.0))
            else:
                # Raw: thinner line
                curve.setPen(pg.mkPen(color=color, width=1.5))
    
    def set_display_seconds(self, seconds: float):
        """Set the time window for display."""
        self.display_seconds = seconds
        self.plot.setXRange(0, seconds, padding=0)
        
        # Update scale bar position
        scale_bar_x = seconds - 1.0
        self.scale_bar.setData(
            x=[scale_bar_x, scale_bar_x],
            y=[self.y_range[0] - 30, self.y_range[0] - 30 + 100]
        )
        self.scale_label.setPos(scale_bar_x + 0.1, self.y_range[0] - 30 + 50)
    
    def set_y_range(self, y_range: tuple):
        """Set the Y-axis range (amplitude scale)."""
        self.y_range = y_range
        
        # Recalculate channel offset
        y_span = y_range[1] - y_range[0]
        self._channel_offset = y_span
        
        # Update Y range to fit all channels
        y_min = y_range[0]
        y_max = (self.n_channels - 1) * self._channel_offset + y_range[1]
        self.plot.setYRange(y_min - 50, y_max + 50, padding=0.02)
        
        # Update channel labels
        self._setup_channel_labels()
    
    def clear(self):
        """Clear all curve data."""
        for curve in self.curves:
            curve.setData([], [])


class TimeSeriesPlotItem(pg.PlotItem):
    """
    Extended PlotItem for individual channel time series.
    
    Features channel-specific annotations and interactions.
    """
    
    def __init__(self, channel_name: str, color: str, **kwargs):
        super().__init__(**kwargs)
        
        self.channel_name = channel_name
        self.color = color
        
        # Setup plot
        self.showGrid(x=True, y=True, alpha=0.2)
        self.setLabel('left', channel_name)
        
        # Create curve
        self.curve = self.plot(pen=pg.mkPen(color=color, width=1.5))
        
        # Envelope curves for variance visualization
        self.upper_env = self.plot(
            pen=pg.mkPen(color=color, width=0.5, style=Qt.PenStyle.DotLine)
        )
        self.lower_env = self.plot(
            pen=pg.mkPen(color=color, width=0.5, style=Qt.PenStyle.DotLine)
        )
    
    def update_data(self, times: np.ndarray, data: np.ndarray, show_envelope: bool = False):
        """Update the curve with new data."""
        self.curve.setData(times, data)
        
        if show_envelope:
            # Calculate rolling variance envelope
            window = 25  # 100ms at 250 Hz
            if len(data) > window:
                std = np.array([np.std(data[max(0, i-window):i+1]) 
                               for i in range(len(data))])
                self.upper_env.setData(times, data + 2*std)
                self.lower_env.setData(times, data - 2*std)
            else:
                self.upper_env.setData([], [])
                self.lower_env.setData([], [])
        else:
            self.upper_env.setData([], [])
            self.lower_env.setData([], [])
