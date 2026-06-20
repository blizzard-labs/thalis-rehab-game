"""
EEG Visualization Console - Real-time visualization for Unicorn EEG data.

This module provides a polished visualization console for live EEG data
including:
- Stacked horizontal scrolling multi-channel time series (raw/filtered)
- RMS amplitude heatmap overlay
- Per-channel signal quality indicators
- Topographic scalp map of band power

Usage:
    from tools.visualization import EEGVisualizationConsole
    console = EEGVisualizationConsole()
    console.start(stream)
"""

from .console import EEGVisualizationConsole, VisualizationConfig
from .time_series import TimeSeriesWidget
from .heatmap import HeatmapOverlay
from .quality import SignalQualityWidget
from .topomap import TopomapWidget

__all__ = [
    'EEGVisualizationConsole',
    'VisualizationConfig',
    'TimeSeriesWidget',
    'HeatmapOverlay',
    'SignalQualityWidget',
    'TopomapWidget',
]
