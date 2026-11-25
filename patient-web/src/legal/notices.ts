import type { Source } from "../practice/session";

// Bump when the meaning or data practices change, so previous readers see it again.
export const NOTICE_VERSION = "2026-11-25.2";
export const NOTICE_KEY = "neuroreach-notice-acknowledgments";
export const NOTICE_EVENT = "neuroreach-notice-open";
export const NOTICE_CLOSE_EVENT = "neuroreach-notice-close";
export const NOTICE_RESET_EVENT = "neuroreach-notice-reset";
export type NoticeKind =
  | "play"
  | "supervised"
  | "staff"
  | "controller"
  | "external";
export type NoticeSection = { title: string; text: string };

export const essentials: NoticeSection[] = [
  {
    title: "A practice companion",
    text: "NeuroReach is an experimental wellness, engagement and biofeedback tool. It does not diagnose, treat, prevent or cure a condition, replace therapy, or promise recovery. Clinical benefit has not been established for this prototype.",
  },
  {
    title: "Stay within your comfort",
    text: "Stay seated, keep your space clear and use only comfortable movements. Pause or stop for pain, dizziness, unusual fatigue or distress. Follow your clinician’s advice about activity and support. If you have seizure or photosensitivity concerns, ask your clinician before playing. No screen activity can be guaranteed risk-free.",
  },
  {
    title: "You can stop at any time",
    text: "Participation is voluntary. Use Pause, End session or close the player. This is not an emergency or continuous safety-monitoring service. Seek urgent help through your local emergency service when needed.",
  },
];

export const cameraNotice: NoticeSection = {
  title: "Camera & movement",
  text: "Independent camera play processes video on this device to estimate your movement. The built-in player does not save camera video or send it to a game provider. No microphone is requested. Camera estimates can be wrong and are not clinical range-of-motion measurements. Browser camera permission is separate; you can decline it and use one-button play.",
};
export const eegNotice: NoticeSection = {
  title: "EEG & calibration",
  text: "The supported headset supplies signals to the local companion for game feedback. NeuroReach does not read thoughts or words, diagnose brain conditions or deliver brain stimulation. Contact, movement and calibration affect the score; a low score is not a measure of ability or effort. Follow the headset manufacturer’s instructions and have trained support for rehabilitation use. If you choose to save a model, calibration files stay on the companion computer for reuse.",
};
export const guestPrivacy: NoticeSection = {
  title: "Your device, your choice to save",
  text: "The built-in player keeps the current round’s activity and available sensor measurements in memory. Session history is saved in this browser only when you choose Save on this device. Saved sessions can include timing, game actions, movement estimates and EEG summaries. Anyone using this browser profile may see them. Delete saved sessions or use Next guest on a shared device. Downloads and companion EEG models are separate copies; clearing browser history does not delete those copies.",
};
export const supervisedPrivacy: NoticeSection = {
  title: "Shared with the supervising staff",
  text: "Joining allows the station to receive your game screen, live camera preview when enabled, and activity/sensor measurements over the session connection. Staff can monitor, pause and end play. The staff workspace saves individual session measurements and reports on its station under the participant label; the live preview is buffered for display, not saved as a video by NeuroReach. Staff must explain the session and obtain your agreement. Ask them about access, retention and deletion, and keep the invitation link private. Pause stops gameplay, but the camera preview can remain visible until you end or close the session.",
};
export const staffNotice: NoticeSection = {
  title: "Supervision & participant agreement",
  text: "Explain the activity, sensor use, live viewing and individual records before registering a participant. Confirm their agreement and any required caregiver/guardian authorization. The in-app checkbox records your confirmation; it is not a signed clinical consent form, research approval or media release. Stay available to the participant, set appropriate limits and verify their condition directly: a delayed or frozen monitor cannot establish safety.",
};
export const externalNotice: NoticeSection = {
  title: "An outside game, with its own rules",
  text: "External games are independent play only and do not create NeuroReach clinical reports. Providers control their games, ads, purchases, accounts, cookies and privacy terms. They may collect network/device and gameplay information. Their content may include flashing effects and is not covered by the built-in games’ visual design. NeuroReach does not endorse or guarantee their safety, accessibility, availability or camera/EEG compatibility. Names and logos belong to their owners; listing them does not imply affiliation.",
};
export const controllerNotice: NoticeSection = {
  title: "Controls sent to your selected game",
  text: "The extension uses browser debugging permission to send keyboard and pointer actions to the game tab you select. The provider receives those actions, not NeuroReach’s camera video or raw EEG through this integration. Keep the controller open for camera/EEG input; camera tracking can continue while its window is covered. Stop controls before ads, purchases, account screens or other sensitive actions. Alt+Shift+S stops game input; close the controller to stop sensor capture. Stop controls alone does not turn off the camera.",
};
export const reportsNotice: NoticeSection = {
  title: "Reports describe practice, not recovery",
  text: "Reports are automatically assembled from available observations and can be incomplete or inaccurate. Game scores, camera estimates, EEG proxies and fatigue flags are not diagnoses, validated recovery outcomes or instructions to change treatment. A per-session normalized score is not directly comparable across days. Changes in setup, difficulty or input can change trends. Formal assessments and professional judgment remain necessary; synthetic/demo signals are not patient evidence.",
};
export const storageNotice: NoticeSection = {
  title: "Storage, exports & privacy limits",
  text: "The browser stores a random guest identifier, device preferences, notice acknowledgments and cached app assets. This build has no built-in advertising analytics or cloud account sync. App hosting can still receive ordinary web requests and network information; outside links use their own services. Local storage is not automatically anonymous or encrypted by NeuroReach. Protect the device, station account, network and exported files. The station operator controls access and retention of supervised records and backups. Deleting a record cannot recall exported or shared copies. HIPAA, GDPR or other compliance is not certified by this notice and depends on the actual deployment and operator’s obligations.",
};
export const websitePrivacy: NoticeSection = {
  title: "Public website & hosting",
  text: "The NeuroReach project publishes this independent-play website on GitHub Pages. Project and privacy contact: Krishna Bhatt, krishbhatt2019@gmail.com. GitHub receives web requests and logs visitor IP addresses for security, even if you are not signed in. The website does not upload your camera video, practice history or reports to GitHub and has no cloud patient account or advertising analytics. Saved guest sessions remain in this browser until you delete them, use Next guest, or clear site data; your browser may also evict local data. Downloads remain wherever you keep them. GitHub controls its hosting logs under its own Privacy Statement. Outside game providers have separate practices. Staff records and EEG run through the local companion, not on GitHub Pages. Community-program resource pages describe a separate program; this notice describes the website’s actual data use.",
};
export const researchNotice: NoticeSection = {
  title: "Research & photographs are separate choices",
  text: "Agreeing to play does not authorize research, publication, marketing, photography or video recording. Obtain separate, appropriate consent and institutional review before collecting individual data for research. A demonstration, a technical test or a sample report is not proof of clinical efficacy or regulatory authorization. This app’s optional individual records go beyond the participation-count-only community pilot described in the project resources.",
};
export const liabilityNotice: NoticeSection = {
  title: "Warranty & liability",
  text: "NeuroReach is open-source software supplied “as is” under the MIT License, without warranties of accuracy, availability, fitness for a particular purpose or other warranties, to the extent permitted by law. The license limits the authors’ and copyright holders’ liability for claims or damages arising from the software or its use, to the extent permitted by law. Software, sensors and connections can fail. Nothing in this notice excludes rights or liability that cannot lawfully be excluded. Acknowledging this notice is not a release of those rights.",
};
export const contactNotice: NoticeSection = {
  title: "Questions & your choices",
  text: "For supervised records, contact the clinic or organization running your station; they control those records. For project questions, contact Krishna Bhatt at krishbhatt2019@gmail.com. Do not email medical records or sensitive sensor data. Safety & privacy stays available in the player. Notice acknowledgments remember the notice version and relevant play or session context in browser storage; they are not an identity-verified consent record.",
};
export const fullNotice = [
  ...essentials,
  guestPrivacy,
  cameraNotice,
  eegNotice,
  supervisedPrivacy,
  staffNotice,
  reportsNotice,
  externalNotice,
  controllerNotice,
  storageNotice,
  websitePrivacy,
  researchNotice,
  liabilityNotice,
  contactNotice,
];

export function noticeFor(kind: NoticeKind, source: Source = "button") {
  const sensors = [
    ...(["camera", "blended"].includes(source) ? [cameraNotice] : []),
    ...(["eeg", "blended"].includes(source) ? [eegNotice] : []),
  ];
  switch (kind) {
    case "play":
      return {
        title: "Before you play",
        sections: [essentials[0], essentials[1], ...sensors, guestPrivacy],
      };
    case "supervised":
      return {
        title: "Before you join your session",
        sections: [essentials[0], supervisedPrivacy, essentials[1], eegNotice],
      };
    case "staff":
      return {
        title: "Before you open the staff workspace",
        sections: [
          essentials[0],
          staffNotice,
          supervisedPrivacy,
          reportsNotice,
        ],
      };
    case "controller":
      return {
        title: "Before you connect game controls",
        sections: [
          essentials[0],
          essentials[1],
          controllerNotice,
          cameraNotice,
          eegNotice,
        ],
      };
    case "external":
      return {
        title: "Before you explore outside games",
        sections: [externalNotice, controllerNotice],
      };
  }
}

type Receipt = { version: string; read: string[] };
// Memory fallback keeps restricted/private storage playable without treating an
// unavailable store as consent. A reload asks again if nothing can be saved.
const memory = new Map<string, Receipt>();
function store(session: boolean) {
  return session ? sessionStorage : localStorage;
}
export function hasAcknowledged(
  id: string,
  session = false,
  scope = "browser",
) {
  const key = NOTICE_KEY + (session ? ":" + scope : "");
  try {
    const value: Receipt = JSON.parse(store(session).getItem(key) || "null");
    return (
      value?.version === NOTICE_VERSION &&
      Array.isArray(value.read) &&
      value.read.includes(id)
    );
  } catch {
    return (
      memory.get(key)?.version === NOTICE_VERSION &&
      !!memory.get(key)?.read.includes(id)
    );
  }
}
export function acknowledge(id: string, session = false, scope = "browser") {
  const key = NOTICE_KEY + (session ? ":" + scope : "");
  let previous: Receipt | undefined = memory.get(key);
  try {
    previous = JSON.parse(store(session).getItem(key) || "null") ?? undefined;
  } catch {
    /* memory fallback */
  }
  const read =
    previous?.version === NOTICE_VERSION && Array.isArray(previous.read)
      ? previous.read
      : [];
  const value = { version: NOTICE_VERSION, read: [...new Set([...read, id])] };
  memory.set(key, value);
  try {
    store(session).setItem(key, JSON.stringify(value));
  } catch {
    /* reading remains available */
  }
}
export function resetNoticeAcknowledgments() {
  memory.delete(NOTICE_KEY);
  window.dispatchEvent(new Event(NOTICE_RESET_EVENT));
  try {
    localStorage.removeItem(NOTICE_KEY);
  } catch {
    /* memory was cleared */
  }
}
