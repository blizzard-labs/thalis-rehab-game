import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Source } from "../practice/session";
import { ResourceLink } from "../brand/ResourceLink";
import {
  acknowledge,
  fullNotice,
  hasAcknowledged,
  liabilityNotice,
  NOTICE_EVENT,
  NOTICE_CLOSE_EVENT,
  NOTICE_RESET_EVENT,
  NOTICE_KEY,
  resetNoticeAcknowledgments,
  NOTICE_VERSION,
  noticeFor,
  type NoticeKind,
} from "./notices";
import "./legal.css";

export function LegalNotice({
  kind,
  source,
  onContinue,
  onClose,
}: {
  kind?: NoticeKind;
  source?: Source;
  onContinue?: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const notice = kind ? noticeFor(kind, source) : null;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    heading.current?.focus();
    window.dispatchEvent(new Event(NOTICE_EVENT));
    return () => {
      element.close();
      window.dispatchEvent(new Event(NOTICE_CLOSE_EVENT));
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const sections = notice?.sections ?? fullNotice;
  return (
    <dialog
      className="nr-notice"
      ref={dialog}
      aria-labelledby="nr-notice-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="nr-notice-heading">
        <span className="nr-notice-eyebrow">
          NeuroReach · Safety &amp; privacy
        </span>
        <h1 id="nr-notice-title" tabIndex={-1} ref={heading}>
          {notice?.title ?? "Safety, privacy & your choices"}
        </h1>
        <p>
          {kind === "supervised"
            ? "Please read this before sharing with the supervising station."
            : "A few things to know, so you can choose how to take part."}
        </p>
      </div>
      <div className="nr-notice-body">
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        {notice && (
          <>
            <p className="nr-notice-rights">
              You can stop at any time. Reading this notice does not grant
              research or media permission.
            </p>
            <details>
              <summary>Full safety, privacy &amp; liability notice</summary>
              {fullNotice
                .filter((section) => !sections.includes(section))
                .map((section) => (
                  <section key={section.title}>
                    <h2>{section.title}</h2>
                    <p>{section.text}</p>
                  </section>
                ))}
            </details>
            <p className="nr-notice-small">
              Provided “as is”, without a promise of results or uninterrupted
              operation. The MIT License limits warranties and liability where
              law permits. Your non-excludable rights remain. See{" "}
              {liabilityNotice.title.toLowerCase()} above.
            </p>
          </>
        )}
        <p className="nr-notice-small">
          Notice {NOTICE_VERSION} ·{" "}
          <a
            href="https://github.com/blizzard-labs/thalis-rehab-game/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT License
          </a>{" "}
          · <a href="mailto:krishbhatt2019@gmail.com">Contact the project</a>
        </p>
        <ResourceLink />
      </div>
      <div className="nr-notice-actions">
        <button type="button" onClick={onClose}>
          {onContinue ? "Go back" : "Close notice"}
        </button>
        {onContinue && (
          <button
            type="button"
            className="nr-notice-continue"
            onClick={onContinue}
          >
            {kind === "supervised"
              ? "Allow sharing & continue"
              : "I understand · continue"}
          </button>
        )}
      </div>
    </dialog>
  );
}

export function NoticeGate({
  kind,
  source,
  session = false,
  scope = "browser",
  children,
  onCancel,
}: {
  kind: NoticeKind;
  source?: Source;
  session?: boolean;
  scope?: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const id = kind + (kind === "play" ? ":" + (source ?? "button") : "");
  const [allowed, setAllowed] = useState(() =>
    hasAcknowledged(id, session, scope),
  );
  useEffect(() => {
    if (session) return;
    const reset = () => setAllowed(false);
    const changed = (event: StorageEvent) => {
      if (event.key === NOTICE_KEY || event.key === null)
        setAllowed(hasAcknowledged(id));
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("neuroreach-guest-handoff");
    if (channel) channel.onmessage = resetNoticeAcknowledgments;
    window.addEventListener(NOTICE_RESET_EVENT, reset);
    window.addEventListener("storage", changed);
    return () => {
      channel?.close();
      window.removeEventListener(NOTICE_RESET_EVENT, reset);
      window.removeEventListener("storage", changed);
    };
  }, [id, session]);
  if (allowed) return <>{children}</>;
  return (
    <div className="nr-notice-waiting">
      <LegalNotice
        kind={kind}
        source={source}
        onClose={onCancel}
        onContinue={() => {
          acknowledge(id, session, scope);
          setAllowed(true);
        }}
      />
    </div>
  );
}

export function SafetyLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="nr-safety-link"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
        aria-label="Safety & privacy"
        title="Safety & privacy"
      >
        <svg viewBox="0 0 26 26" width="25" height="25" aria-hidden="true">
          <path
            d="M13 2.5 22 6v6.5c0 5-4.8 8.8-9 11-4.2-2.2-9-6-9-11V6Z"
            fill="#faf9f7"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="m9 13 2.5 2.5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <LegalNotice onClose={() => setOpen(false)} />}
    </>
  );
}
