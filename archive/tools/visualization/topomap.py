"""
Topomap Widget - Topographic scalp map for band power visualization.

This module provides a topographic map display showing the spatial
distribution of EEG band power across the scalp.
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from scipy import signal as scipy_signal
from scipy.interpolate import CloughTocher2DInterpolator, griddata

from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont

import pyqtgraph as pg


class TopomapWidget(QWidget):
    """
    Topographic scalp map widget for band power visualization.
    
    Features:
    - Interpolated scalp map from 8 electrode positions
    - Selectable frequency band (delta, theta, alpha, beta, gamma)
    - Head outline with nose indicator
    - Color-coded power distribution
    - Channel position markers
    """
    
    def __init__(
        self,
        channel_names: List[str],
        channel_info: Dict[str, Dict],
        colors: Optional[Dict[str, str]] = None,
        parent=None
    ):
        super().__init__(parent)
        
        self.channel_names = channel_names
        self.n_channels = len(channel_names)
        self.channel_info = channel_info
        self.colors = colors or {}
        
        # Current band
        self.current_band = 'alpha'
        self.band_freqs = (8, 13)
        
        # Grid for interpolation
        self.grid_resolution = 64
        self._setup_interpolation_grid()
        
        # Band power values
        self.band_powers = np.zeros(self.n_channels)
        
        self._setup_ui()
    
    def _setup_interpolation_grid(self):
        """Setup the interpolation grid for topomap."""
        # Create a circular grid
        x = np.linspace(-1, 1, self.grid_resolution)
        y = np.linspace(-1, 1, self.grid_resolution)
        self.grid_x, self.grid_y = np.meshgrid(x, y)
        
        # Create mask for circular head shape
        radius = 0.85
        self.head_mask = np.sqrt(self.grid_x**2 + self.grid_y**2) <= radius
        
        # Get channel positions
        self.channel_positions = np.array([
            self.channel_info[ch]['pos'] for ch in self.channel_names
        ])
    
    def _setup_ui(self):
        """Initialize the topomap display."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)
        
        # Create graphics widget
        self.graphics_widget = pg.GraphicsLayoutWidget()
        self.graphics_widget.setBackground(self.colors.get('background', '#1e1e2e'))
        layout.addWidget(self.graphics_widget)
        
        # Create view box for the topomap
        self.view = self.graphics_widget.addViewBox()
        self.view.setAspectLocked(True)
        self.view.setRange(xRange=(-1.2, 1.2), yRange=(-1.2, 1.2))
        self.view.setMouseEnabled(x=False, y=False)
        
        # Create image item for the interpolated topomap
        self.topomap_img = pg.ImageItem()
        self.view.addItem(self.topomap_img)
        
        # Setup colormap (RdBu for diverging data, viridis for sequential)
        self.colormap = pg.colormap.get('viridis')
        self.topomap_img.setColorMap(self.colormap)
        
        # Initialize with zeros
        initial_data = np.zeros((self.grid_resolution, self.grid_resolution))
        initial_data[~self.head_mask] = np.nan
        self.topomap_img.setImage(initial_data)
        
        # Position the image correctly
        self.topomap_img.setRect(-1, -1, 2, 2)
        
        # Add head outline
        self._draw_head_outline()
        
        # Add electrode markers
        self._draw_electrode_markers()
        
        # Add colorbar
        self._add_colorbar()
        
        # Band label
        self.band_label = QLabel(f"Band: {self.current_band} ({self.band_freqs[0]}-{self.band_freqs[1]} Hz)")
        self.band_label.setStyleSheet(f"""
            color: {self.colors.get('foreground', '#cdd6f4')};
            font-weight: bold;
            font-size: 11px;
        """)
        self.band_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.band_label)
    
    def _draw_head_outline(self):
        """Draw the head outline with nose and ears."""
        # Head circle
        theta = np.linspace(0, 2 * np.pi, 100)
        head_radius = 0.85
        head_x = head_radius * np.cos(theta)
        head_y = head_radius * np.sin(theta)
        
        head_outline = pg.PlotDataItem(
            head_x, head_y,
            pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=2)
        )
        self.view.addItem(head_outline)
        
        # Nose (triangle at top)
        nose_x = np.array([-0.1, 0, 0.1, -0.1])
        nose_y = np.array([0.85, 1.0, 0.85, 0.85])
        nose = pg.PlotDataItem(
            nose_x, nose_y,
            pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=2)
        )
        self.view.addItem(nose)
        
        # Left ear
        ear_theta = np.linspace(np.pi * 0.4, np.pi * 0.6, 20)
        left_ear_x = -0.95 + 0.1 * np.cos(ear_theta)
        left_ear_y = 0.1 * np.sin(ear_theta) * 3
        left_ear = pg.PlotDataItem(
            left_ear_x, left_ear_y,
            pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=2)
        )
        self.view.addItem(left_ear)
        
        # Right ear
        right_ear_x = 0.95 - 0.1 * np.cos(ear_theta)
        right_ear = pg.PlotDataItem(
            right_ear_x, left_ear_y,
            pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=2)
        )
        self.view.addItem(right_ear)
    
    def _draw_electrode_markers(self):
        """Draw electrode position markers with labels."""
        self.electrode_markers = []
        self.electrode_labels = []
        
        for i, ch_name in enumerate(self.channel_names):
            pos = self.channel_info[ch_name]['pos']
            
            # Electrode dot
            marker = pg.ScatterPlotItem(
                pos=np.array([[pos[0], pos[1]]]),
                size=12,
                brush=pg.mkBrush(color=self.colors.get('accent', '#89b4fa')),
                pen=pg.mkPen(color=self.colors.get('foreground', '#cdd6f4'), width=1)
            )
            self.view.addItem(marker)
            self.electrode_markers.append(marker)
            
            # Channel label
            label = pg.TextItem(
                text=ch_name,
                color=self.colors.get('foreground', '#cdd6f4'),
                anchor=(0.5, 1.5)
            )
            label.setPos(pos[0], pos[1])
            label.setFont(QFont('Arial', 8, QFont.Weight.Bold))
            self.view.addItem(label)
            self.electrode_labels.append(label)
    
    def _add_colorbar(self):
        """Add a colorbar to show power scale."""
        # Create a horizontal colorbar below the topomap
        colorbar_widget = QWidget()
        colorbar_layout = QHBoxLayout(colorbar_widget)
        colorbar_layout.setContentsMargins(20, 0, 20, 0)
        
        # Min label
        self.min_label = QLabel("0")
        self.min_label.setStyleSheet(f"color: {self.colors.get('foreground', '#cdd6f4')};")
        colorbar_layout.addWidget(self.min_label)
        
        # Gradient bar
        gradient_widget = pg.GraphicsLayoutWidget()
        gradient_widget.setBackground(self.colors.get('background', '#1e1e2e'))
        gradient_widget.setMaximumHeight(20)
        
        gradient_plot = gradient_widget.addPlot()
        gradient_plot.hideAxis('left')
        gradient_plot.hideAxis('bottom')
        gradient_plot.setMouseEnabled(x=False, y=False)
        
        gradient_data = np.linspace(0, 1, 100).reshape(1, -1)
        gradient_img = pg.ImageItem()
        gradient_img.setImage(gradient_data, levels=(0, 1))
        gradient_img.setColorMap(self.colormap)
        gradient_plot.addItem(gradient_img)
        
        colorbar_layout.addWidget(gradient_widget)
        
        # Max label
        self.max_label = QLabel("max µV²/Hz")
        self.max_label.setStyleSheet(f"color: {self.colors.get('foreground', '#cdd6f4')};")
        colorbar_layout.addWidget(self.max_label)
        
        self.layout().addWidget(colorbar_widget)
    
    def update_data(
        self, 
        data: np.ndarray, 
        sample_rate: int = 250,
        band: str = 'alpha',
        band_freqs: Tuple[float, float] = (8, 13)
    ):
        """
        Update the topomap with new data.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data array of shape (n_channels, n_samples).
        sample_rate : int
            Sampling rate in Hz.
        band : str
            Frequency band name.
        band_freqs : tuple
            (low_freq, high_freq) for the band.
        """
        if data.shape[1] < sample_rate:  # Need at least 1 second
            return
        
        self.current_band = band
        self.band_freqs = band_freqs
        
        # Compute band power for each channel
        self.band_powers = self._compute_band_power(data, sample_rate, band_freqs)
        
        # Interpolate to grid
        topomap_data = self._interpolate_topomap(self.band_powers)
        
        # Apply head mask
        topomap_data[~self.head_mask] = np.nan
        
        # Update image
        power_min = np.nanmin(topomap_data)
        power_max = np.nanmax(topomap_data)
        
        self.topomap_img.setImage(
            topomap_data.T,  # Transpose for correct orientation
            levels=(power_min, power_max)
        )
        
        # Update labels
        self.band_label.setText(f"Band: {band} ({band_freqs[0]}-{band_freqs[1]} Hz)")
        self.min_label.setText(f"{power_min:.1f}")
        self.max_label.setText(f"{power_max:.1f} µV²/Hz")
        
        # Update electrode marker colors based on power
        self._update_electrode_colors()
    
    def _compute_band_power(
        self, 
        data: np.ndarray, 
        sample_rate: int, 
        band_freqs: Tuple[float, float]
    ) -> np.ndarray:
        """
        Compute band power for each channel using Welch's method.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data of shape (n_channels, n_samples).
        sample_rate : int
            Sampling rate in Hz.
        band_freqs : tuple
            (low_freq, high_freq) for the band.
            
        Returns
        -------
        np.ndarray
            Band power for each channel.
        """
        powers = np.zeros(self.n_channels)
        
        for i in range(self.n_channels):
            # Compute PSD using Welch's method
            freqs, psd = scipy_signal.welch(
                data[i, :], 
                fs=sample_rate, 
                nperseg=min(256, data.shape[1])
            )
            
            # Extract band power
            band_mask = (freqs >= band_freqs[0]) & (freqs <= band_freqs[1])
            if np.any(band_mask):
                # Mean power in band
                powers[i] = np.mean(psd[band_mask])
            else:
                powers[i] = 0.0
        
        return powers
    
    def _interpolate_topomap(self, values: np.ndarray) -> np.ndarray:
        """
        Interpolate electrode values to a grid for topomap display.
        
        Uses Clough-Tocher cubic interpolation for smooth results.
        
        Parameters
        ----------
        values : np.ndarray
            Values at each electrode position.
            
        Returns
        -------
        np.ndarray
            Interpolated grid of shape (grid_resolution, grid_resolution).
        """
        try:
            # Try Clough-Tocher interpolation (smooth)
            interpolator = CloughTocher2DInterpolator(
                self.channel_positions, 
                values,
                fill_value=np.nan
            )
            grid_values = interpolator(self.grid_x, self.grid_y)
        except Exception:
            # Fallback to linear interpolation
            grid_values = griddata(
                self.channel_positions,
                values,
                (self.grid_x, self.grid_y),
                method='cubic',
                fill_value=np.nan
            )
        
        # Handle NaN values at edges
        grid_values = np.nan_to_num(grid_values, nan=np.nanmean(values))
        
        return grid_values
    
    def _update_electrode_colors(self):
        """Update electrode marker colors based on power values."""
        if self.band_powers is None or len(self.band_powers) == 0:
            return
        
        # Normalize powers to 0-1
        power_min = np.min(self.band_powers)
        power_max = np.max(self.band_powers)
        power_range = power_max - power_min
        
        if power_range < 1e-10:
            normalized = np.ones(self.n_channels) * 0.5
        else:
            normalized = (self.band_powers - power_min) / power_range
        
        # Update marker colors using colormap
        for i, marker in enumerate(self.electrode_markers):
            # Get color from colormap
            color = self.colormap.map(normalized[i], mode='qcolor')
            marker.setBrush(pg.mkBrush(color))
    
    def set_band(self, band: str):
        """Set the frequency band for display."""
        band_map = {
            'delta': (1, 4),
            'theta': (4, 8),
            'alpha': (8, 13),
            'beta': (13, 30),
            'gamma': (30, 50),
        }
        
        if band in band_map:
            self.current_band = band
            self.band_freqs = band_map[band]
            self.band_label.setText(f"Band: {band} ({self.band_freqs[0]}-{self.band_freqs[1]} Hz)")
    
    def clear(self):
        """Clear the topomap display."""
        self.band_powers = np.zeros(self.n_channels)
        
        # Reset to zeros
        initial_data = np.zeros((self.grid_resolution, self.grid_resolution))
        initial_data[~self.head_mask] = np.nan
        self.topomap_img.setImage(initial_data)
        
        # Reset electrode colors
        for marker in self.electrode_markers:
            marker.setBrush(pg.mkBrush(color=self.colors.get('accent', '#89b4fa')))


class MNETopomap:
    """
    Helper class to use MNE's topomap functionality if available.
    
    Falls back to custom interpolation if MNE is not installed.
    """
    
    def __init__(self, channel_names: List[str], channel_info: Dict[str, Dict]):
        self.channel_names = channel_names
        self.channel_info = channel_info
        
        # Try to import MNE
        try:
            import mne
            self._mne_available = True
            self._setup_mne_info()
        except ImportError:
            self._mne_available = False
            print("[Warning] MNE not available, using custom interpolation for topomap")
    
    def _setup_mne_info(self):
        """Setup MNE Info object with channel locations."""
        import mne
        
        # Create channel positions in MNE format
        ch_types = ['eeg'] * len(self.channel_names)
        
        # Create montage with 2D positions converted to 3D
        dig_ch_pos = {}
        for ch_name in self.channel_names:
            pos_2d = self.channel_info[ch_name]['pos']
            # Convert 2D to 3D (place on unit sphere surface)
            x, y = pos_2d
            z = np.sqrt(max(0, 1 - x**2 - y**2))
            dig_ch_pos[ch_name] = np.array([x, y, z])
        
        # Create montage
        montage = mne.channels.make_dig_montage(ch_pos=dig_ch_pos, coord_frame='head')
        
        # Create Info
        self.mne_info = mne.create_info(
            ch_names=self.channel_names,
            sfreq=250,
            ch_types=ch_types
        )
        self.mne_info.set_montage(montage)
    
    @property
    def available(self) -> bool:
        """Check if MNE is available."""
        return self._mne_available
    
    def plot_topomap(
        self, 
        values: np.ndarray,
        ax=None,
        **kwargs
    ):
        """
        Plot topomap using MNE if available.
        
        Parameters
        ----------
        values : np.ndarray
            Values at each electrode.
        ax : matplotlib axis, optional
            Axis to plot on.
        **kwargs
            Additional arguments passed to MNE's plot_topomap.
        """
        if not self._mne_available:
            raise RuntimeError("MNE not available")
        
        import mne
        from mne.viz import plot_topomap
        
        return plot_topomap(
            values,
            self.mne_info,
            axes=ax,
            show=False,
            **kwargs
        )
