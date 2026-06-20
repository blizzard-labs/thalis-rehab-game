"""
Signal Quality Widget - Per-channel signal quality indicators.

This module provides visual indicators for EEG signal quality including
RMS amplitude, line noise level, saturation detection, and overall quality score.
"""

import numpy as np
from typing import List, Dict, Optional
from scipy import signal as scipy_signal

from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QGridLayout, QFrame
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QPainter, QColor, QBrush, QPen

import pyqtgraph as pg


class SignalQualityWidget(QWidget):
    """
    Signal quality indicator widget for EEG channels.
    
    Displays quality metrics for each channel:
    - Overall quality score (Good/Moderate/Poor/Bad)
    - RMS amplitude
    - Line noise (60 Hz) level
    - Saturation percentage
    - Baseline drift indicator
    
    Quality is computed from multiple factors:
    - Low RMS (<15 µV = good, <40 µV = moderate)
    - Low line noise power
    - No saturation (values hitting rails)
    - Stable baseline
    """
    
    def __init__(
        self,
        channel_names: List[str],
        thresholds: Optional[Dict[str, float]] = None,
        colors: Optional[Dict[str, str]] = None,
        parent=None
    ):
        super().__init__(parent)
        
        self.channel_names = channel_names
        self.n_channels = len(channel_names)
        self.thresholds = thresholds or {
            'good': 10.0,
            'moderate': 30.0,
            'poor': 100.0,
        }
        self.colors = colors or {}
        
        # Quality metrics storage
        self.quality_scores = np.zeros(self.n_channels)
        self.rms_values = np.zeros(self.n_channels)
        self.line_noise = np.zeros(self.n_channels)
        self.saturation_pct = np.zeros(self.n_channels)
        
        self._setup_ui()
    
    def _setup_ui(self):
        """Initialize the quality indicator UI."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)
        
        # Create grid for channel quality indicators
        grid = QGridLayout()
        grid.setSpacing(4)
        
        self.quality_indicators = []
        
        for i, ch_name in enumerate(self.channel_names):
            indicator = ChannelQualityIndicator(
                ch_name,
                colors=self.colors
            )
            row = i // 4  # 4 columns
            col = i % 4
            grid.addWidget(indicator, row, col)
            self.quality_indicators.append(indicator)
        
        layout.addLayout(grid)
        
        # Overall quality summary
        summary_frame = QFrame()
        summary_frame.setStyleSheet(f"""
            QFrame {{
                background-color: {self.colors.get('grid', '#45475a')};
                border-radius: 6px;
                padding: 4px;
            }}
        """)
        summary_layout = QHBoxLayout(summary_frame)
        summary_layout.setContentsMargins(8, 4, 8, 4)
        
        self.overall_label = QLabel("Overall Quality: --")
        self.overall_label.setStyleSheet(f"""
            color: {self.colors.get('foreground', '#cdd6f4')};
            font-weight: bold;
            font-size: 12px;
        """)
        summary_layout.addWidget(self.overall_label)
        
        summary_layout.addStretch()
        
        # Quality legend
        legend_layout = QHBoxLayout()
        legend_layout.setSpacing(12)
        
        for quality, color_key in [('Good', 'good'), ('Moderate', 'moderate'), 
                                    ('Poor', 'poor'), ('Bad', 'bad')]:
            legend_item = QLabel(f"● {quality}")
            legend_item.setStyleSheet(f"""
                color: {self.colors.get(color_key, '#cdd6f4')};
                font-size: 10px;
            """)
            legend_layout.addWidget(legend_item)
        
        summary_layout.addLayout(legend_layout)
        
        layout.addWidget(summary_frame)
    
    def update_data(self, data: np.ndarray, sample_rate: int = 250):
        """
        Update quality indicators with new data.
        
        Parameters
        ----------
        data : np.ndarray
            EEG data array of shape (n_channels, n_samples).
        sample_rate : int
            Sampling rate in Hz (default: 250).
        """
        if data.shape[1] < 100:  # Need at least some data
            return
        
        # Compute quality metrics for each channel
        for i in range(self.n_channels):
            channel_data = data[i, :]
            
            # RMS amplitude
            self.rms_values[i] = np.sqrt(np.mean(channel_data**2))
            
            # Line noise (60 Hz power)
            self.line_noise[i] = self._compute_line_noise(channel_data, sample_rate)
            
            # Saturation detection
            self.saturation_pct[i] = self._compute_saturation(channel_data)
            
            # Overall quality score (0-100)
            self.quality_scores[i] = self._compute_quality_score(
                self.rms_values[i],
                self.line_noise[i],
                self.saturation_pct[i]
            )
            
            # Update indicator
            quality_level = self._get_quality_level(self.quality_scores[i])
            self.quality_indicators[i].update_quality(
                quality_level=quality_level,
                rms=self.rms_values[i],
                line_noise=self.line_noise[i],
                saturation=self.saturation_pct[i]
            )
        
        # Update overall quality
        mean_score = np.mean(self.quality_scores)
        overall_level = self._get_quality_level(mean_score)
        
        color_map = {
            'Good': self.colors.get('good', '#a6e3a1'),
            'Moderate': self.colors.get('moderate', '#f9e2af'),
            'Poor': self.colors.get('poor', '#fab387'),
            'Bad': self.colors.get('bad', '#f38ba8'),
        }
        
        self.overall_label.setText(f"Overall Quality: {overall_level} ({mean_score:.0f}%)")
        self.overall_label.setStyleSheet(f"""
            color: {color_map.get(overall_level, '#cdd6f4')};
            font-weight: bold;
            font-size: 12px;
        """)
    
    def _compute_line_noise(self, data: np.ndarray, sample_rate: int) -> float:
        """Compute 60 Hz line noise power."""
        if len(data) < sample_rate:
            return 0.0
        
        # Compute power spectrum
        freqs, psd = scipy_signal.welch(data, fs=sample_rate, nperseg=min(256, len(data)))
        
        # Find power around 60 Hz (±2 Hz)
        mask = (freqs >= 58) & (freqs <= 62)
        if not np.any(mask):
            return 0.0
        
        line_noise_power = np.mean(psd[mask])
        
        # Normalize to dB relative to average power
        avg_power = np.mean(psd)
        if avg_power > 0:
            noise_ratio = 10 * np.log10(line_noise_power / avg_power + 1e-10)
        else:
            noise_ratio = 0.0
        
        return max(0, noise_ratio)
    
    def _compute_saturation(self, data: np.ndarray, threshold: float = 500.0) -> float:
        """Compute percentage of saturated samples."""
        if len(data) == 0:
            return 0.0
        
        # Check for values near saturation limits
        saturated = np.abs(data) > threshold
        return 100.0 * np.mean(saturated)
    
    def _compute_quality_score(
        self, 
        rms: float, 
        line_noise: float, 
        saturation: float
    ) -> float:
        """
        Compute overall quality score (0-100).
        
        Higher score = better quality.
        """
        score = 100.0
        
        # Penalize high RMS (normalized to 0-40 points)
        rms_penalty = min(40, rms / self.thresholds['good'] * 10)
        score -= rms_penalty
        
        # Penalize line noise (normalized to 0-30 points)
        noise_penalty = min(30, line_noise * 3)
        score -= noise_penalty
        
        # Penalize saturation (0-30 points)
        sat_penalty = saturation * 0.3
        score -= sat_penalty
        
        return max(0, min(100, score))
    
    def _get_quality_level(self, score: float) -> str:
        """Convert quality score to level string."""
        if score >= 80:
            return 'Good'
        elif score >= 60:
            return 'Moderate'
        elif score >= 40:
            return 'Poor'
        else:
            return 'Bad'
    
    def clear(self):
        """Clear all quality indicators."""
        self.quality_scores.fill(0)
        self.rms_values.fill(0)
        self.line_noise.fill(0)
        self.saturation_pct.fill(0)
        
        for indicator in self.quality_indicators:
            indicator.clear()


class ChannelQualityIndicator(QWidget):
    """
    Individual channel quality indicator widget.
    
    Shows:
    - Channel name
    - Quality color dot
    - RMS value
    - Mini bar showing quality level
    """
    
    def __init__(self, channel_name: str, colors: Optional[Dict[str, str]] = None, parent=None):
        super().__init__(parent)
        
        self.channel_name = channel_name
        self.colors = colors or {}
        
        self.quality_level = 'Good'
        self.rms = 0.0
        self.line_noise = 0.0
        self.saturation = 0.0
        
        self._setup_ui()
    
    def _setup_ui(self):
        """Setup the indicator UI."""
        self.setMinimumWidth(120)
        self.setMinimumHeight(70)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(2)
        
        # Channel name and quality dot
        header_layout = QHBoxLayout()
        header_layout.setSpacing(6)
        
        self.quality_dot = QualityDot(self.colors)
        header_layout.addWidget(self.quality_dot)
        
        self.name_label = QLabel(self.channel_name)
        self.name_label.setStyleSheet(f"""
            color: {self.colors.get('foreground', '#cdd6f4')};
            font-weight: bold;
            font-size: 11px;
        """)
        header_layout.addWidget(self.name_label)
        header_layout.addStretch()
        
        layout.addLayout(header_layout)
        
        # Metrics
        self.rms_label = QLabel("RMS: -- µV")
        self.rms_label.setStyleSheet(f"""
            color: {self.colors.get('foreground', '#cdd6f4')};
            font-size: 9px;
        """)
        layout.addWidget(self.rms_label)
        
        self.noise_label = QLabel("60Hz: -- dB")
        self.noise_label.setStyleSheet(f"""
            color: {self.colors.get('foreground', '#cdd6f4')};
            font-size: 9px;
        """)
        layout.addWidget(self.noise_label)
        
        # Quality bar
        self.quality_bar = QualityBar(self.colors)
        layout.addWidget(self.quality_bar)
        
        # Set frame style
        self.setStyleSheet(f"""
            QWidget {{
                background-color: {self.colors.get('grid', '#45475a')};
                border-radius: 6px;
            }}
        """)
    
    def update_quality(
        self, 
        quality_level: str, 
        rms: float, 
        line_noise: float, 
        saturation: float
    ):
        """Update the quality indicator with new values."""
        self.quality_level = quality_level
        self.rms = rms
        self.line_noise = line_noise
        self.saturation = saturation
        
        # Update quality dot
        self.quality_dot.set_quality(quality_level)
        
        # Update labels
        self.rms_label.setText(f"RMS: {rms:.1f} µV")
        self.noise_label.setText(f"60Hz: {line_noise:.1f} dB")
        
        # Update quality bar
        score = {'Good': 90, 'Moderate': 65, 'Poor': 45, 'Bad': 20}.get(quality_level, 50)
        self.quality_bar.set_value(score, quality_level)
    
    def clear(self):
        """Clear the indicator."""
        self.quality_dot.set_quality('Good')
        self.rms_label.setText("RMS: -- µV")
        self.noise_label.setText("60Hz: -- dB")
        self.quality_bar.set_value(0, 'Good')


class QualityDot(QWidget):
    """Colored dot indicating quality level."""
    
    def __init__(self, colors: Optional[Dict[str, str]] = None, parent=None):
        super().__init__(parent)
        self.colors = colors or {}
        self.quality = 'Good'
        self.setFixedSize(12, 12)
    
    def set_quality(self, quality: str):
        """Set the quality level."""
        self.quality = quality
        self.update()
    
    def paintEvent(self, event):
        """Paint the quality dot."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        color_map = {
            'Good': self.colors.get('good', '#a6e3a1'),
            'Moderate': self.colors.get('moderate', '#f9e2af'),
            'Poor': self.colors.get('poor', '#fab387'),
            'Bad': self.colors.get('bad', '#f38ba8'),
        }
        
        color = QColor(color_map.get(self.quality, '#cdd6f4'))
        painter.setBrush(QBrush(color))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(1, 1, 10, 10)


class QualityBar(QWidget):
    """Horizontal bar showing quality score."""
    
    def __init__(self, colors: Optional[Dict[str, str]] = None, parent=None):
        super().__init__(parent)
        self.colors = colors or {}
        self.value = 0
        self.quality = 'Good'
        self.setFixedHeight(6)
        self.setMinimumWidth(50)
    
    def set_value(self, value: float, quality: str):
        """Set the bar value (0-100) and quality level."""
        self.value = max(0, min(100, value))
        self.quality = quality
        self.update()
    
    def paintEvent(self, event):
        """Paint the quality bar."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Background
        bg_color = QColor(self.colors.get('background', '#1e1e2e'))
        painter.setBrush(QBrush(bg_color))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawRoundedRect(0, 0, self.width(), self.height(), 3, 3)
        
        # Foreground (quality indicator)
        color_map = {
            'Good': self.colors.get('good', '#a6e3a1'),
            'Moderate': self.colors.get('moderate', '#f9e2af'),
            'Poor': self.colors.get('poor', '#fab387'),
            'Bad': self.colors.get('bad', '#f38ba8'),
        }
        
        fg_color = QColor(color_map.get(self.quality, '#cdd6f4'))
        painter.setBrush(QBrush(fg_color))
        
        bar_width = int(self.width() * self.value / 100)
        if bar_width > 0:
            painter.drawRoundedRect(0, 0, bar_width, self.height(), 3, 3)
