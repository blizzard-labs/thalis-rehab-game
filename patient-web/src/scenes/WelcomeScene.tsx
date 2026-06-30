import logoSrc from '../../img/logo.png';

export function WelcomeScene({ firstName, onBegin }: { firstName: string; onBegin: () => void }) {
  return (
    <main className="scene scene--welcome" aria-labelledby="welcome-title">
      <img src={logoSrc} alt="NeuroReach" className="welcome-logo" />
      <div className="welcome-card">
        <div className="mascot" aria-hidden="true" />
        <h1 id="welcome-title" className="welcome-title">
          Hi {firstName} — ready to play?
        </h1>
        <button type="button" className="big-button" onClick={onBegin}>
          Let's begin!
        </button>
      </div>
    </main>
  );
}
