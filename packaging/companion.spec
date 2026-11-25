# Build from the repo root after npm run build.
import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules, copy_metadata

root = Path(SPECPATH).parent
web = root / "patient-web" / "dist"
assert (web / "sw.js").exists(), "Build the web application first"
binaries = collect_dynamic_libs("pylsl")
if sys.platform == "darwin":
    lsl = Path(os.environ["PYLSL_LIB"]).resolve()
    assert lsl.is_file(), "Provide the build machine's liblsl; it is bundled for users"
    binaries.append((str(lsl), "pylsl/lib"))
a = Analysis([str(root / "signal-engine" / "companion_desktop.py")],
    pathex=[str(root / "signal-engine")],
    datas=[(str(web), "web"), (str(root / "LICENSE"), "licenses"),
           *collect_data_files("mne", include_py_files=True), *copy_metadata("mne"),
           *collect_data_files("pylsl"), *copy_metadata("pylsl")],
    binaries=binaries,
    runtime_hooks=[str(root / "packaging" / "runtime.py")],
    hiddenimports=["acquisition.practice_eeg", *collect_submodules("mne", filter=lambda module: ".tests" not in module),
                   "sklearn.discriminant_analysis", "sklearn.covariance"],
    excludes=["IPython", "pytest", "torch", "tensorflow", "PyQt5", "PySide6"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="NeuroReach", console=False,
          icon=str(web / "brand" / "favicon.png"),
          codesign_identity=os.environ.get("NEUROREACH_CODESIGN_IDENTITY"))
collection = COLLECT(exe, a.binaries, a.datas, name="NeuroReach")
if sys.platform == "darwin":
    app = BUNDLE(collection, name="NeuroReach.app", icon=str(web / "brand" / "favicon.png"),
                 bundle_identifier="org.neuroreach.companion",
                 version=os.environ.get("NEUROREACH_VERSION", "0.2.0"),
                 info_plist={"NSHighResolutionCapable": True,
                             "LSMinimumSystemVersion": "15.0",
                             "CFBundleDisplayName": "NeuroReach"})
