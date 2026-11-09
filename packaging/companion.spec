# Build from the repo root after npm run build.
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata

root = Path(SPECPATH).parent
web = root / "patient-web" / "dist"
assert (web / "sw.js").exists(), "Build the web application first"
a = Analysis([str(root/"signal-engine"/"local_companion.py")],
    pathex=[str(root/"signal-engine")],
    datas=[(str(web), "web"), *collect_data_files("mne"), *copy_metadata("mne"),
           *collect_data_files("pylsl"), *copy_metadata("pylsl")],
    binaries=collect_dynamic_libs("pylsl"),
    hiddenimports=["mne.decoding.csp","sklearn.discriminant_analysis","sklearn.covariance"],
    excludes=["IPython","pytest","tkinter","torch","tensorflow","PyQt5","PySide6"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="NeuroReach", console=True)
collection = COLLECT(exe, a.binaries, a.datas, name="NeuroReach")
