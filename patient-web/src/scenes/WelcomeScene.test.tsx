import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeScene } from "./WelcomeScene";

describe("WelcomeScene", () => {
  it("greets the patient by name", () => {
    render(<WelcomeScene firstName="Margaret" onBegin={() => {}} />);
    expect(screen.getByText(/Hi Margaret/i)).toBeInTheDocument();
  });
  it("fires onBegin when the big button is pressed", async () => {
    const onBegin = vi.fn();
    render(<WelcomeScene firstName="Margaret" onBegin={onBegin} />);
    await userEvent.click(screen.getByRole("button", { name: /let's begin/i }));
    expect(onBegin).toHaveBeenCalledOnce();
  });
});
