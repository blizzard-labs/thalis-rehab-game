// The same client is served at / by the companion and under a project path
// by GitHub Pages. APIs remain on the companion; only static assets use this base.
export const assetUrl = (path: string) =>
  import.meta.env.BASE_URL + path.replace(/^\//, "");
export const isLocalStation = () =>
  import.meta.env.VITE_WEBSITE_BUILD !== "1" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
export const companionUrl = (destination = "") =>
  "http://127.0.0.1:8766/" + destination;
