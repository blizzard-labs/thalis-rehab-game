import { useLayoutEffect, useRef, useState } from "react";

/** Frame the playable part of a landscape on a phone. Extend the sky and
 * ground vertically instead of shrinking a whole wide illustration to a strip. */
export function useLandscape(centerX: number, minimumWidth: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState("0 0 960 460");
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    function measure() {
      const { width, height } = svg!.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const unitsWide = Math.min(960, Math.max(minimumWidth, 460 * aspect));
      const unitsHigh = Math.max(380, unitsWide / aspect);
      const left = Math.max(
        0,
        Math.min(960 - unitsWide, centerX - unitsWide / 2),
      );
      setViewBox(
        `${left} ${(460 - unitsHigh) * 0.48} ${unitsWide} ${unitsHigh}`,
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [centerX, minimumWidth]);
  return { ref, viewBox };
}
