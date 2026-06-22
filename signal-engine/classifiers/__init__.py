"""Per-patient CSP+LDA motor-imagery classifier and online decode pipeline.

Public API:
    CSPLDAClassifier, FitResult, ModelNotFittedError  (csp_lda)
    OnlineClassifier                                   (online_classifier)
"""

from classifiers.csp_lda import (
    CSPLDAClassifier,
    FitResult,
    ModelNotFittedError,
)
from classifiers.online_classifier import OnlineClassifier

__all__ = [
    "CSPLDAClassifier",
    "FitResult",
    "ModelNotFittedError",
    "OnlineClassifier",
]
