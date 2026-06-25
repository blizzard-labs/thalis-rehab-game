export function WelcomeScene({ firstName, onBegin }: { firstName: string; onBegin: () => void }) {
  return (
    <main className="scene scene--welcome" aria-labelledby="welcome-title">
      <div className="welcome-card">
        <div className="mascot" aria-hidden="true" />
        <h1 id="welcome-title" className="welcome-title">
          Hi {firstName} — ready to play?
        </h1>
        <p className="welcome-sub">
          We'll warm up with a quick game. Just relax and follow along. Your therapist is right here.
        </p>
        <button type="button" className="big-button" onClick={onBegin}>
          Let's begin
        </button>
      </div>
    </main>
  );
}
