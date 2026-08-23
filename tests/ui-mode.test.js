import test from "node:test";
import assert from "node:assert/strict";
import { setTimerMode } from "../src/ui.js";

test("inactive timer mode fields cannot validate or enter FormData", () => {
  const normalControls = [{ disabled: false }, { disabled: false }];
  const pomodoroControls = [{ disabled: false }, { disabled: false }];
  const groups = {
    normal: {
      hidden: false,
      querySelectorAll: () => normalControls,
    },
    pomodoro: {
      hidden: false,
      querySelectorAll: () => pomodoroControls,
    },
  };
  const form = {
    elements: { kind: { value: "normal" } },
    querySelector(selector) {
      return groups[selector.includes("pomodoro") ? "pomodoro" : "normal"];
    },
  };

  setTimerMode(form, "pomodoro");
  assert.equal(form.elements.kind.value, "pomodoro");
  assert.equal(groups.normal.hidden, true);
  assert.equal(groups.pomodoro.hidden, false);
  assert.equal(normalControls.every(({ disabled }) => disabled), true);
  assert.equal(pomodoroControls.every(({ disabled }) => !disabled), true);
});
