"""Synthetic Unicorn-format validation fixture. Kept separate from the companion."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from acquisition.mock_eeg_outlet import MockUnicornOutlet

if __name__ == "__main__":
    device = MockUnicornOutlet(stream_name="UN-validation-fixture", stream_type="Data", seed=42)
    device.start()
    try:
        # Leave a full baseline before alternating desynchronization and rest.
        time.sleep(74)
        while True:
            for channel in ["C3","C4"]:
                device.inject_erd(channel, (8,12), 0, 4, 1)
            time.sleep(8)
    finally:
        device.stop()
