/** One acquisition per patient tab. Preview and WebRTC independently release their leases. */
let pending: Promise<MediaStream> | null = null;
let leases = 0;

export async function acquireCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
  pending ??= navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  leases++;
  let stream: MediaStream;
  try { stream = await pending; }
  catch (error) { if (--leases === 0) pending = null; throw error; }
  let active = true;
  return { stream, release() {
    if (!active) return;
    active = false;
    if (--leases === 0) {
      pending = null;
      stream.getTracks().forEach(t => t.stop());
    }
  }};
}
