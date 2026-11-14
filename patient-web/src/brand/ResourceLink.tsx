import "./resource-link.css";

export function ResourceLink() {
  return (
    <a
      className="nr-resource-link"
      href="https://neuroreach.notion.site/NeuroReach-EEG-Assisted-Motor-Rehabilitation-RESOURCES-3ac0b3bfcc1381189586e200abe4d8cd"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="NeuroReach resources (opens in a new tab)"
      title="NeuroReach resources (opens in a new tab)"
    >
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="11.5" fill="#faf9f7" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="8.2" r="1.35" fill="currentColor" />
        <path d="M13 12v6" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </a>
  );
}
