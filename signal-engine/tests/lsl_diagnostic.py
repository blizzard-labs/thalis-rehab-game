import time
import sys
from pylsl import StreamInlet, resolve_streams

def diagnose_unicorn_lsl():
    print("====================================================")
    print("      Unicorn Hybrid Black LSL Diagnostic Tool       ")
    print("====================================================\n")
    
    print("[1/3] Scanning for active LSL streams on the network...")
    # Look for all active LSL streams
    streams = resolve_streams(wait_time=2.0)
    
    if not streams:
        print("\n❌ DIAGNOSIS: No LSL streams found anywhere on the network.")
        print("\n💡 Troubleshooting Steps:")
        print("  1. Ensure the Unicorn headset is turned ON and paired via Bluetooth.")
        print("  2. Open 'Unicorn Suite' -> 'DevTools' -> 'LSL Interface' -> 'Open'.")
        print("  3. Make sure you actually launched the UnicornLSL executable, selected your device, and clicked 'Start' or 'Play'.")
        print("  4. Check your firewall settings; it might be blocking local UDP/TCP traffic.")
        sys.exit(1)
        
    print(f"Found {len(streams)} active LSL stream(s):")
    unicorn_stream = None
    
    for s in streams:
        print(f" - Name: '{s.name()}', Type: '{s.type()}', Channels: {s.channel_count()}, Host: {s.hostname()}")
        # Check for typical Unicorn naming conventions
        if "unicorn" in s.name().lower() or s.type().lower() == "eeg":
            unicorn_stream = s

    print("\n[2/3] Validating Unicorn specific stream...")
    if not unicorn_stream:
        print("\n⚠️ DIAGNOSIS: Found LSL streams, but none match 'Unicorn' or type 'EEG'.")
        print("Using the first available stream as a fallback...")
        unicorn_stream = streams[0]
    else:
        print(f"✅ Success! Target stream matched: '{unicorn_stream.name()}'")

    # Connect to the stream
    print(f"\n[3/3] Attempting to connect and pull data from '{unicorn_stream.name()}'...")
    try:
        inlet = StreamInlet(unicorn_stream, max_chunklen=1)
        
        # Pull a sample with a 3-second timeout
        sample, timestamp = inlet.pull_sample(timeout=3.0)
        
        if timestamp is not None:
            print("\n🎉 CONNECTION SUCCESSFUL! Data is streaming perfectly.")
            print(f"Timestamp: {timestamp}")
            print(f"Sample data (First 8 channels are usually EEG):")
            print(sample)
            
            print("\nStreaming real-time samples (Press Ctrl+C to stop):")
            print("-" * 50)
            count = 0
            while count < 10:  # Show 10 samples then exit cleanly
                sample, timestamp = inlet.pull_sample(timeout=1.0)
                if sample:
                    # Format to 2 decimal places for readable console output
                    formatted_sample = [round(val, 2) for val in sample[:8]]
                    print(f"EEG Ch 1-8: {formatted_sample}")
                    count += 1
                    time.sleep(0.1)
                    
        else:
            raise TimeoutError

    except (TimeoutError, Exception) as e:
        print("\n❌ DIAGNOSIS: Connection timed out or failed while pulling data.")
        print("\n💡 Troubleshooting Steps:")
        print("  1. The LSL stream application is open, but the headset itself might be paused or disconnected.")
        print("  2. In the Unicorn Recorder or LSL interface, ensure the 'Play/Acquisition' button has been pressed.")
        print("  3. If you are on macOS and using custom Bluetooth scripts, your bluetooth daemon might be stuck. Try: 'sudo pkill bluetoothd'")
        print(f"  Error details: {e}")

if __name__ == "__main__":
    try:
        diagnose_unicorn_lsl()
    except KeyboardInterrupt:
        print("\nTest stopped by user.")