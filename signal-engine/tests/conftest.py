"""Make the hyphenated `signal-engine` dir importable for tests.

The repo directory is `signal-engine` (not a valid Python identifier), so the
`acquisition` subpackage isn't reachable via a normal import. Prepend
`signal-engine` to sys.path here so tests can `from acquisition... import ...`.
"""

from __future__ import annotations

import sys
from pathlib import Path

_SIGNAL_ENGINE = Path(__file__).resolve().parent.parent
if str(_SIGNAL_ENGINE) not in sys.path:
    sys.path.insert(0, str(_SIGNAL_ENGINE))


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "live: opt-in tests needing real hardware/heavy deps (skipped on CI)",
    )
