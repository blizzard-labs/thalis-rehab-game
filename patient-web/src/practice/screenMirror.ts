import { useEffect, type RefObject } from "react";

export type ScreenEdits = Record<string, string | null>;
export type ScreenFrame = {
  type: "frame";
  html?: string;
  css?: string;
  scene?: number;
  edits?: ScreenEdits;
  width: number;
  height: number;
};

export function mirrorSocket(path: string) {
  const url = new URL(path, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url);
}

type Media = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;
const isMedia = (el: Element): el is Media =>
  el instanceof HTMLVideoElement ||
  el instanceof HTMLCanvasElement ||
  el instanceof HTMLImageElement;
const excluded = "script,iframe,object,embed,link,base,meta,style";
const nodeId = "data-nr-mirror";

function screenStyles() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function screenCapture(root: HTMLElement) {
  const canvas = document.createElement("canvas");
  const pictures = new WeakMap<
    HTMLImageElement,
    { url: string; data: string }
  >();
  let ids = new WeakMap<Element, number>();
  let media: Media[] = [],
    edits: ScreenEdits = {};
  let width = 0,
    height = 0,
    offset = 0,
    scene = 0;
  let rebuild = true,
    changed = false,
    lastMedia = -Infinity;
  const videoTimes = new WeakMap<HTMLVideoElement, number>();

  function picture(el: Media) {
    const video = el instanceof HTMLVideoElement;
    const image = el instanceof HTMLImageElement;
    const w = video ? el.videoWidth : image ? el.naturalWidth : el.width;
    const h = video ? el.videoHeight : image ? el.naturalHeight : el.height;
    if (!w || !h || (!image && (!el.clientWidth || !el.clientHeight)))
      return "";
    if (image) {
      const cached = pictures.get(el);
      if (cached?.url === el.currentSrc) return cached.data;
    }
    const limit = Math.min(640, Math.max(160, el.clientWidth, el.clientHeight));
    const scale = Math.min(1, limit / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    try {
      canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
      const data = video
        ? canvas.toDataURL("image/jpeg", 0.65)
        : canvas.toDataURL("image/png");
      if (image) pictures.set(el, { url: el.currentSrc, data });
      return data;
    } catch {
      return "";
    }
  }

  function set(el: Element, name: string, value: string | null) {
    const id = ids.get(el);
    if (id === undefined) return;
    const key = id + ":" + name;
    if (edits[key] !== value) {
      edits[key] = value;
      changed = true;
    }
  }

  function observe(records: MutationRecord[]) {
    for (const record of records) {
      if (rebuild) return;
      const el =
        record.target instanceof Element
          ? record.target
          : record.target.parentElement;
      if (!el || !ids.has(el)) continue;
      if (record.type === "attributes") {
        const name = record.attributeName!;
        if (el instanceof HTMLInputElement && name === "value") {
          set(el, name, el.type === "password" ? "" : el.value);
        } else if (el === root || isMedia(el) || record.attributeNamespace) {
          rebuild = true;
        } else {
          set(el, name, el.getAttribute(name));
        }
      } else if (
        el.childElementCount === 0 &&
        ![...record.addedNodes, ...record.removedNodes].some(
          (node) => node.nodeType === 1,
        )
      ) {
        set(el, "#text", el.textContent);
      } else {
        rebuild = true;
      }
    }
  }
  const observer = new MutationObserver(observe);
  observer.observe(root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  const formChange = () => {
    rebuild = true;
  };
  root.addEventListener("input", formChange);
  root.addEventListener("change", formChange);
  root.addEventListener("load", formChange, true);

  function snapshot(rect: DOMRect, top: number) {
    const copy = root.cloneNode(true) as HTMLElement;
    const originals = [root, ...root.querySelectorAll("*")];
    const clones = [copy, ...copy.querySelectorAll("*")];
    ids = new WeakMap();
    media = [];
    edits = {};
    originals.forEach((el, id) => {
      let clone: Element = clones[id];
      ids.set(el, id);
      if (isMedia(el)) {
        const img = document.createElement("img");
        img.className = el.className;
        img.style.cssText = el.style.cssText;
        img.width = el.clientWidth;
        img.height = el.clientHeight;
        img.alt =
          el instanceof HTMLImageElement
            ? el.alt
            : el instanceof HTMLVideoElement
              ? "Patient camera preview"
              : "Game graphics";
        if (el instanceof HTMLImageElement) {
          const src = picture(el);
          if (src) img.src = src;
        } else {
          media.push(el);
          if (el instanceof HTMLVideoElement) {
            // The mirrored element is an image; retain the patient's video crop and orientation.
            const style = getComputedStyle(el);
            img.style.objectFit = style.objectFit;
            img.style.transform = style.transform;
            videoTimes.delete(el);
          }
        }
        clone.replaceWith(img);
        clone = img;
      } else if (el instanceof HTMLInputElement) {
        clone.setAttribute("value", el.type === "password" ? "" : el.value);
        clone.toggleAttribute("checked", el.checked);
      } else if (el instanceof HTMLTextAreaElement) {
        clone.textContent = el.value;
      } else if (el instanceof HTMLOptionElement) {
        clone.toggleAttribute("selected", el.selected);
      }
      clone.setAttribute(nodeId, String(id));
    });
    copy.querySelectorAll(excluded).forEach((el) => el.remove());
    copy.style.margin = "0";
    copy.style.width = rect.width + "px";
    copy.style.transform = "translateY(" + top + "px)";
    rebuild = false;
    scene++;
    lastMedia = -Infinity;
    return copy.outerHTML;
  }

  return {
    capture(
      full: boolean,
      now: number,
      heartbeat: boolean,
    ): ScreenFrame | null {
      observe(observer.takeRecords());
      const rect = root.getBoundingClientRect();
      const w = Math.ceil(rect.width),
        h = Math.min(innerHeight, Math.ceil(rect.height));
      if (w < 1 || h < 1) return null;
      const top = Math.min(0, rect.top);
      let html: string | undefined;
      if (full || rebuild || w !== width || h !== height || top !== offset) {
        html = snapshot(rect, top);
        width = w;
        height = h;
        offset = top;
      }
      if (now - lastMedia >= 65) {
        lastMedia = now;
        const videoPictures = new Map<MediaProvider, string>();
        for (const el of media) {
          const expanded = el.closest<HTMLElement>(".cal-camera__expand");
          if (expanded) {
            const visible = expanded.parentElement?.matches(":hover") ?? false;
            set(
              expanded,
              "style",
              expanded.style.cssText +
                ";opacity:" +
                (visible ? "1;transform:scale(1)" : "0"),
            );
            if (!visible) continue;
          }
          if (el instanceof HTMLVideoElement) {
            if (videoTimes.get(el) === el.currentTime) continue;
            videoTimes.set(el, el.currentTime);
          }
          const stream = el instanceof HTMLVideoElement ? el.srcObject : null;
          const data = (stream && videoPictures.get(stream)) || picture(el);
          if (stream && data) videoPictures.set(stream, data);
          if (data) set(el, "src", data);
        }
      }
      if (html === undefined && !changed && !heartbeat) return null;
      changed = false;
      return { type: "frame", scene, html, width, height, edits };
    },
    close() {
      observer.disconnect();
      root.removeEventListener("input", formChange);
      root.removeEventListener("change", formChange);
      root.removeEventListener("load", formChange, true);
    },
  };
}

export function useScreenPublisher(
  root: RefObject<HTMLDivElement>,
  token: string,
  enabled: boolean,
) {
  useEffect(() => {
    if (!token || !enabled) return;
    let closed = false,
      timer = 0;
    let socket: WebSocket | null = null;
    let capture: ReturnType<typeof screenCapture> | undefined;
    function connect() {
      if (closed) return;
      const ws = mirrorSocket("/api/display/mirror");
      socket = ws;
      let first = true,
        watching = false,
        incremental = false,
        lastSent = 0;
      function publish() {
        if (closed || !watching || ws.readyState !== WebSocket.OPEN) return;
        const now = performance.now();
        if (root.current && ws.bufferedAmount === 0) {
          capture ??= screenCapture(root.current);
          const frame = capture.capture(
            first || !incremental,
            now,
            now - lastSent >= 900,
          );
          if (frame) {
            if (first) frame.css = screenStyles();
            if (!incremental && frame.html && frame.edits) {
              // Older companions and consoles only understand standalone frames.
              const template = document.createElement("template");
              template.innerHTML = frame.html;
              applyScreenEdits(indexScreen(template.content), frame.edits);
              frame.html = template.innerHTML;
              delete frame.edits;
              delete frame.scene;
            }
            ws.send(JSON.stringify(frame));
            lastSent = now;
            first = false;
          }
        }
        timer = window.setTimeout(publish, incremental ? 33 : 200);
      }
      ws.onopen = () => ws.send(JSON.stringify({ token, updates: true }));
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type !== "ready" && msg.type !== "mode") return;
        clearTimeout(timer);
        watching = msg.watching !== false;
        incremental = msg.updates === true;
        first = true;
        capture?.close();
        capture = undefined;
        publish();
      };
      ws.onclose = () => {
        clearTimeout(timer);
        capture?.close();
        capture = undefined;
        if (!closed) timer = window.setTimeout(connect, 1200);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      capture?.close();
      socket?.close();
    };
  }, [root, token, enabled]);
}

export function indexScreen(root: ParentNode) {
  return new Map(
    Array.from(root.querySelectorAll("[" + nodeId + "]"), (el) => [
      el.getAttribute(nodeId)!,
      el,
    ]),
  );
}

export function applyScreenEdits(
  nodes: Map<string, Element>,
  edits: ScreenEdits,
) {
  for (const [key, value] of Object.entries(edits)) {
    const colon = key.indexOf(":");
    const el = nodes.get(key.slice(0, colon));
    const name = key.slice(colon + 1);
    if (!el || (value !== null && typeof value !== "string")) continue;
    if (name === "#text") {
      if (!el.childElementCount && el.textContent !== value)
        el.textContent = value;
    } else if (
      /^[a-zA-Z_][\w.:-]*$/.test(name) &&
      !/^(on|srcdoc$|xmlns|data-nr-mirror$)/i.test(name)
    ) {
      if (value === null) el.removeAttribute(name);
      else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
  }
}

export const mirrorDocument = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<style id="patient-styles"></style>
<style>html,body{margin:0!important;padding:0!important;overflow:hidden!important}*{caret-color:transparent!important}#patient-screen{pointer-events:none}</style>
</head><body><div id="patient-screen" inert></div></body></html>`;
