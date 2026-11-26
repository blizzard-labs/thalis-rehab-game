// Fixed, data-only commands. No scripts, selectors, URLs, or arbitrary CDP
// methods cross the website/extension boundary. Discard unrecognized fields.
function controlCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { type } = value;
  switch (type) {
    case "hello":
    case "heartbeat":
    case "stop":
    case "click":
    case "hold":
    case "release":
      return { type };
    case "arm":
      return { type, focusGame: value.focusGame === true, showAim: value.showAim === true };
    case "move":
      return [value.x, value.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
        ? { type, x: value.x, y: value.y } : null;
    case "key":
    case "steer":
      return (type === "steer" && value.key === null) ||
        ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", ...(type === "key" ? ["Space"] : [])].includes(value.key)
        ? { type, key: value.key } : null;
    case "setup-saved":
    case "setup-restored":
      return typeof value.token === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(value.token)
        ? { type, token: value.token, saved: value.saved === true } : null;
    default:
      return null;
  }
}
