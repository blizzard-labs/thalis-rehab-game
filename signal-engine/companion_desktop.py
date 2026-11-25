"""Desktop entry point: bundled runtime, local service and a small status window."""

import asyncio
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import sys
import threading
import webbrowser
from urllib.request import urlopen


class Companion:
    """Own only the service started by this launcher; reuse another station safely."""

    def __init__(self, port=8766, local_only=False):
        self.port = port
        self.local_only = local_only
        self.state = "stopped"
        self.owned = False
        self.thread = None
        self.loop = None
        self.shutdown = None
        self.closing = threading.Event()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.closing.clear()
        self.state = "starting"
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def _run(self):
        try:
            try:
                with urlopen(self.url + "/api/health", timeout=2) as response:
                    health = json.load(response)
                if health.get("app") == "NeuroReach" and health.get("staffRuns", 0) >= 3:
                    self.state = "shared" if not self.closing.is_set() else "stopped"
                    return
            except (OSError, ValueError):
                pass
            if self.closing.is_set():
                self.state = "stopped"
                return

            async def run():
                from local_companion import options, serve
                self.loop = asyncio.get_running_loop()
                self.shutdown = asyncio.Event()
                if self.closing.is_set():
                    return
                args = options(["--port", str(self.port)] + (["--local-only"] if self.local_only else []))

                def ready():
                    self.owned = True
                    self.state = "ready"

                await serve(args, ready=ready, shutdown=self.shutdown)

            asyncio.run(run())
            self.state = "stopped"
        except OSError:
            logging.exception("Companion could not bind its local address")
            self.state = "port-error"
        except Exception:
            logging.exception("Companion could not start")
            self.state = "error"
        finally:
            self.owned = False
            self.loop = None
            self.shutdown = None

    def stop(self):
        self.closing.set()
        loop, shutdown = self.loop, self.shutdown
        if loop and shutdown:
            try:
                loop.call_soon_threadsafe(shutdown.set)
            except RuntimeError:
                pass  # The service already completed its cleanup.
        if self.thread:
            self.thread.join(timeout=15)
        if self.state == "shared":
            self.state = "stopped"


def configure_logging():
    directory = Path(os.environ.get("NEUROREACH_DATA_DIR", Path.home() / ".neuroreach")) / "logs"
    directory.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(directory / "companion.log", maxBytes=1_000_000, backupCount=2)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.WARNING)
    return directory


def desktop(port=8766, smoke=False):
    import tkinter as tk
    from tkinter import messagebox, ttk

    logs = configure_logging()
    companion = Companion(port, local_only=smoke)
    window = tk.Tk()
    window.title("NeuroReach Companion")
    window.geometry("540x390")
    window.minsize(500, 390)
    window.configure(background="#fdf9f4")
    if smoke:
        window.attributes("-topmost", True)
        window.lift()
        window.focus_force()
    style = ttk.Style(window)
    style.configure("TFrame", background="#fdf9f4")
    style.configure("TLabel", background="#fdf9f4", foreground="#4d405b", font=("Helvetica", 12))
    style.configure("Title.TLabel", font=("Helvetica", 25, "bold"), foreground="#644575")
    style.configure("Status.TLabel", font=("Helvetica", 14, "bold"))
    style.configure("TButton", padding=(12, 9))
    frame = ttk.Frame(window, padding=28)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="NeuroReach", style="Title.TLabel").pack(anchor="w")
    ttk.Label(frame, text="Your companion for practice and supervision").pack(anchor="w", pady=(4, 22))
    status = ttk.Label(frame, text="Starting…", style="Status.TLabel")
    status.pack(anchor="w")
    detail = ttk.Label(frame, text="Opening your local workspace.", wraplength=470)
    detail.pack(anchor="w", pady=(8, 18))
    buttons = ttk.Frame(frame)
    buttons.pack(fill="x")
    staff = ttk.Button(buttons, text="Open staff workspace", command=lambda: webbrowser.open(companion.url + "/#staff"))
    staff.pack(side="left", padx=(0, 8))
    games = ttk.Button(buttons, text="Open games", command=lambda: webbrowser.open(companion.url))
    games.pack(side="left")
    footer = ttk.Frame(frame)
    footer.pack(side="bottom", fill="x", pady=(20, 0))
    retry = ttk.Button(footer, text="Try again", command=companion.start)
    ttk.Button(footer, text="Setup help", command=lambda: webbrowser.open("https://github.com/blizzard-labs/thalis-rehab-game#companion-setup")).pack(side="left")

    def quit_app():
        if companion.owned and not smoke and not messagebox.askokcancel(
            "Quit NeuroReach?", "Finish any active sessions first. Quitting stops this computer’s companion.", parent=window
        ):
            return
        companion.stop()
        window.destroy()

    ttk.Button(footer, text="Quit", command=quit_app).pack(side="right")
    window.protocol("WM_DELETE_WINDOW", quit_app)
    if sys.platform == "darwin":
        window.createcommand("tk::mac::Quit", quit_app)
    opened = False
    ticks = 0
    failure = []

    def poll():
        nonlocal opened, ticks
        ticks += 1
        state = companion.state
        ready = state in ("ready", "shared")
        for button in (staff, games):
            button.configure(state="normal" if ready else "disabled")
        if ready:
            status.configure(text="Ready to use")
            detail.configure(text="Keep this window open during sessions. Your games and staff workspace open in your browser." if state == "ready" else "NeuroReach is already running on this computer. Closing this window will leave that companion running.")
            retry.pack_forget()
            if not opened:
                opened = True
                if not smoke:
                    webbrowser.open(companion.url + "/#staff")
        elif state in ("error", "port-error", "stopped"):
            status.configure(text="Could not start")
            detail.configure(text="Another application is using NeuroReach’s address. Close it and try again; your saved records are unchanged." if state == "port-error" else "Please try again. Setup help has troubleshooting steps. Diagnostic logs are saved on this computer.")
            retry.pack(side="left", padx=8)
        else:
            status.configure(text="Starting…")
        if smoke and ((ready and ticks >= 3) or state in ("error", "port-error") or ticks > 120):
            if not ready:
                failure.append(state)
            screenshot = os.environ.get("NEUROREACH_DESKTOP_SCREENSHOT")
            if screenshot:
                from PIL import ImageGrab
                window.update()
                x, y = window.winfo_rootx(), window.winfo_rooty()
                previous_path = os.environ.get("PATH", "")
                try:
                    if sys.platform == "darwin":
                        # Pillow uses Apple's screencapture utility. This
                        # directory contains neither Python nor Node.
                        os.environ["PATH"] = "/usr/sbin"
                    ImageGrab.grab(bbox=(x, y, x + window.winfo_width(), y + window.winfo_height())).save(screenshot)
                except Exception as error:
                    failure.append(f"desktop screenshot: {error}")
                finally:
                    os.environ["PATH"] = previous_path
            window.after(500, quit_app)
            return
        window.after(500, poll)

    companion.start()
    window.after(100, poll)
    try:
        window.mainloop()
    finally:
        companion.stop()
    if failure:
        raise RuntimeError(f"Desktop launch check failed: {failure}; see {logs}")


def main():
    # Retain the service CLI for existing installations, tests and clinic IT.
    # Finder and Start menu launches have no arguments and show the desktop UI.
    if len(sys.argv) == 3 and sys.argv[1] == "--runtime-check":
        import tkinter
        import pylsl
        import mne
        import sklearn
        import reportlab
        from local_companion import DIST
        Path(sys.argv[2]).write_text(json.dumps({
            "frozen": bool(getattr(sys, "frozen", False)),
            "web": (DIST / "index.html").is_file(),
            "camera": (DIST / "models" / "pose_landmarker_lite.task").is_file(),
            "lsl": pylsl.library_version(),
            "tk": tkinter.TkVersion,
        }))
    elif "--desktop-smoke-check" in sys.argv:
        from local_companion import options
        args = options([arg for arg in sys.argv[1:] if arg != "--desktop-smoke-check"])
        desktop(args.port, smoke=True)
    elif len(sys.argv) > 1:
        from local_companion import main as service
        service(sys.argv[1:])
    else:
        desktop()


if __name__ == "__main__":
    main()
