import type { CDPSession } from "@playwright/test";

// Native toolbar and side-panel documents are browser UI. Playwright's page
// list omits them, so use their actual Chromium targets for these clicks.
export async function evaluateView(
  client: CDPSession,
  suffix: string,
  expression: string,
) {
  const targets = await client.send("Target.getTargets");
  const target = targets.targetInfos.find((item) => item.url.endsWith(suffix));
  if (!target) throw new Error("Controller view is closed: " + suffix);
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  const result = new Promise<any>((resolve) => {
    const receive = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const reply = JSON.parse(event.message);
      if (reply.id !== 1) return;
      client.off("Target.receivedMessageFromTarget", receive);
      resolve(reply);
    };
    client.on("Target.receivedMessageFromTarget", receive);
  });
  try {
    await client.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, userGesture: true },
      }),
    });
    const reply = await result;
    if (reply.result?.exceptionDetails || reply.error)
      throw new Error(JSON.stringify(reply));
    return reply.result.result.value;
  } finally {
    await client.send("Target.detachFromTarget", { sessionId }).catch(() => {});
  }
}

