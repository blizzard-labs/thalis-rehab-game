"""Use the included LSL library, independent of the user's development environment."""
import os
from pathlib import Path
import sys

if sys.platform == 'darwin':
    candidates = sorted((Path(sys._MEIPASS) / 'pylsl' / 'lib').glob('liblsl*.dylib'))
    if not candidates:
        raise RuntimeError('The NeuroReach installation is missing its LSL library.')
    os.environ['PYLSL_LIB'] = str(candidates[0])
