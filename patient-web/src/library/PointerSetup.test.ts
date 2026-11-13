import { expect, it } from "vitest";
import { pointerPosition, cameraDirection } from "./PointerSetup";
const range = {
  rest: { x: 0, y: 0 },
  topLeft: { x: 0.6, y: -0.4 },
  bottomRight: { x: -0.6, y: 0.4 },
};
it("maps the mirrored comfortable rectangle and clamps to the selected game area", () => {
  expect(pointerPosition(range, range.rest)).toEqual({ x: 0.5, y: 0.5 });
  expect(pointerPosition(range, range.topLeft)).toEqual({ x: 0.01, y: 0.01 });
  expect(pointerPosition(range, { x: -8, y: 10 })).toEqual({
    x: 0.99,
    y: 0.99,
  });
});
it("maps four body-relative directions and retains a neutral resting zone", () => {
  expect(cameraDirection(range, { x: 0.6, y: 0 }).key).toBe("ArrowLeft");
  expect(cameraDirection(range, { x: -0.6, y: 0 }).key).toBe("ArrowRight");
  expect(cameraDirection(range, { x: 0, y: -0.4 }).key).toBe("ArrowUp");
  expect(cameraDirection(range, { x: 0, y: 0.4 }).key).toBe("ArrowDown");
  expect(cameraDirection(range, range.rest).level).toBe(0);
});
