# Build from the repo root after npm run build.
import os
import sys
from pathlib import Path
from PyInstaller import isolated
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules, copy_metadata

root = Path(SPECPATH).parent
web = root / "patient-web" / "dist"
assert (web / "sw.js").exists(), "Build the web application first"
binaries = collect_dynamic_libs("pylsl")
desktop_data = []
if sys.platform == "darwin":
    lsl = Path(os.environ["PYLSL_LIB"]).resolve()
    assert lsl.is_file(), "Provide the build machine's liblsl; it is bundled for users"
    binaries.append((str(lsl), "pylsl/lib"))
    # Some Intel Python builds report the Tk header version (8.5), although
    # the linked library is 8.6. Ask the running Tk for its scripts rather
    # than letting the hook guess a nonexistent tk8.5 folder.
    def tk_scripts():
        import tkinter
        window = tkinter.Tk()
        window.withdraw()
        try:
            return window.tk.eval("set tk_library")
        finally:
            window.destroy()
    tk_directory = isolated.call(tk_scripts)
    assert (Path(tk_directory) / "tk.tcl").is_file(), "Tk scripts are required in the installer"
    desktop_data.append((tk_directory, "_tk_data"))
a = Analysis([str(root / "signal-engine" / "companion_desktop.py")],
    pathex=[str(root / "signal-engine")],
    datas=[(str(web), "web"), (str(root / "LICENSE"), "licenses"), *desktop_data,
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
