import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no WebGL context. Stub the R3F Canvas so warm-up hand components
// mount without rendering WebGL; the 3D scene graph is exercised in the browser,
// not in unit tests. Children (three elements) are intentionally not rendered.
vi.mock("@react-three/fiber", () => ({
  Canvas: () => null,
}));
