import { expect,it,vi } from "vitest";
import { acquireCamera } from "./sharedCamera";
it("shares one acquisition and stops tracks after both owners release", async () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => ({getTracks:()=>[{stop}]}));
  const original = Object.getOwnPropertyDescriptor(navigator,"mediaDevices");
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia}});
  try {
    const [preview,published] = await Promise.all([acquireCamera(),acquireCamera()]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    preview.release(); expect(stop).not.toHaveBeenCalled();
    published.release(); expect(stop).toHaveBeenCalledTimes(1);
  } finally {
    if (original) Object.defineProperty(navigator,"mediaDevices",original);
    else Reflect.deleteProperty(navigator,"mediaDevices");
  }
});
