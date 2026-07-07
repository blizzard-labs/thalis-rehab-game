// Presentational pairing gate. The LAN connection + handshake live in
// `usePatientLink` (owned by App) so the socket survives into the game; this
// scene only reflects its state while we wait for the `paired` reply.
export function PairingScene({ error }: { error: string | null }) {
  return (
    <div className="pairing-scene">
      {error ? (
        <p role="alert">We couldn't connect ({error}). Ask your clinician to start a new session.</p>
      ) : (
        <p>Connecting to your session…</p>
      )}
    </div>
  );
}
