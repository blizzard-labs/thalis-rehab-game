import { useEffect, type RefObject } from "react";

export type ScreenFrame = {
  type: "frame";
  html: string;
  css?: string;
  width: number;
  height: number;
};

export function mirrorSocket(path: string) {
  const url = new URL(path, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url);
}

function imageOf(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
) {
  const width =
    source instanceof HTMLVideoElement
      ? source.videoWidth
      : source instanceof HTMLImageElement
        ? source.naturalWidth
        : source.width;
  const height =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source instanceof HTMLImageElement
        ? source.naturalHeight
        : source.height;
  if (!width || !height) return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(640, width);
  canvas.height = Math.max(1, Math.round((height * canvas.width) / width));
  try {
    canvas
      .getContext("2d")!
      .drawImage(source, 0, 0, canvas.width, canvas.height);
    return source instanceof HTMLVideoElement
      ? canvas.toDataURL("image/jpeg", 0.65)
      : canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function capture(root: HTMLElement): ScreenFrame {
  const copy = root.cloneNode(true) as HTMLElement;
  const originals = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  const animated = new Map<Element, Set<string>>();
  for (const animation of root.getAnimations({ subtree: true })) {
    const effect = animation.effect as KeyframeEffect | null;
    if (!effect?.target) continue;
    const properties = animated.get(effect.target) ?? new Set<string>();
    for (const frame of effect.getKeyframes())
      for (const property of Object.keys(frame))
        if (
          !["offset", "computedOffset", "easing", "composite"].includes(
            property,
          )
        )
          properties.add(
            property.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()),
          );
    animated.set(effect.target, properties);
  }
  originals.forEach((original, index) => {
    const clone = copies[index];
    if (
      original instanceof HTMLVideoElement ||
      original instanceof HTMLCanvasElement ||
      original instanceof HTMLImageElement
    ) {
      const image = document.createElement("img");
      image.className = original.className;
      image.style.cssText = original.style.cssText;
      image.width = original.clientWidth;
      image.height = original.clientHeight;
      image.alt =
        original instanceof HTMLImageElement
          ? original.alt
          : original instanceof HTMLVideoElement
            ? "Patient camera preview"
            : "Game graphics";
      image.src = imageOf(original);
      clone.replaceWith(image);
    } else if (original instanceof HTMLInputElement) {
      (clone as HTMLInputElement).setAttribute(
        "value",
        original.type === "password" ? "" : original.value,
      );
      clone.toggleAttribute("checked", original.checked);
    } else if (original instanceof HTMLTextAreaElement) {
      clone.textContent = original.value;
    } else if (original instanceof HTMLOptionElement) {
      clone.toggleAttribute("selected", original.selected);
    }
    if (animated.has(original) && clone.style) {
      const style = getComputedStyle(original);
      for (const property of animated.get(original)!)
        clone.style.setProperty(property, style.getPropertyValue(property));
    }
  });
  // Only the patient application's subtree is shared.
  copy
    .querySelectorAll("script, iframe, object, embed, link, base")
    .forEach((el) => el.remove());
  const rect = root.getBoundingClientRect();
  copy.style.margin = "0";
  copy.style.width = rect.width + "px";
  copy.style.transform = "translateY(" + Math.min(0, rect.top) + "px)";
  return {
    type: "frame",
    html: copy.outerHTML,
    width: Math.ceil(rect.width),
    height: Math.min(innerHeight, Math.ceil(rect.height)),
  };
}

function screenStyles() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

export function useScreenPublisher(
  root: RefObject<HTMLDivElement>,
  token: string,
  enabled: boolean,
) {
  useEffect(() => {
    if (!token || !enabled) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    function connect() {
      if (closed) return;
      const ws = mirrorSocket("/api/display/mirror");
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ token }));
      ws.onmessage = (event) => {
        if (JSON.parse(event.data).type !== "ready") return;
        let first = true;
        function publish() {
          if (closed || ws.readyState !== WebSocket.OPEN) return;
          if (root.current && ws.bufferedAmount < 200000) {
            const frame = capture(root.current);
            if (first) frame.css = screenStyles();
            ws.send(JSON.stringify(frame));
            first = false;
          }
          timer = window.setTimeout(publish, 200);
        }
        publish();
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!closed) timer = window.setTimeout(connect, 1200);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [root, token, enabled]);
}

export const mirrorDocument = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">
<style id="patient-styles"></style>
<style>html,body{margin:0!important;padding:0!important;overflow:hidden!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}#patient-screen{pointer-events:none}</style>
</head><body><div id="patient-screen" inert></div></body></html>`;
