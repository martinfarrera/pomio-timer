import { TIMER_COLORS, getCurrentPhaseDisplay } from "./domain/timers.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(symbol, label, action, timerId) {
  const button = element("button", "icon-button", symbol);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.dataset.action = action;
  button.dataset.timerId = timerId;
  return button;
}

export function createTimerCard(timer, now = Date.now()) {
  const display = getCurrentPhaseDisplay(timer, now);
  const card = element("article", "timer-card");
  card.dataset.timerId = timer.id;
  card.dataset.color = timer.color;
  card.dataset.phase = timer.runtime.phase ?? "normal";
  card.style.setProperty("--progress-angle", `${display.progress * 360}deg`);

  const heading = element("div", "card-heading");
  if (timer.emoji) heading.append(element("span", "timer-emoji", timer.emoji));
  heading.append(element("h3", "", timer.name));
  if (timer.kind === "pomodoro") {
    heading.append(element("span", "cycle-label", `${timer.runtime.cycleIndex + 1}/${timer.config.hours}`));
  }

  const face = element("div", "timer-face");
  face.setAttribute("role", "timer");
  face.setAttribute("aria-label", `${display.minutes} minutes ${display.seconds} seconds`);
  const time = element("div", "time-display");
  time.append(
    element("span", "time-minutes", display.minutes),
    element("span", "time-seconds", display.seconds),
    element("span", "phase-label", timer.runtime.phase ?? timer.kind),
  );
  face.append(time);

  const controls = element("div", "timer-actions");
  controls.append(actionButton("↺", `Reset ${timer.name}`, "reset", timer.id));
  controls.append(actionButton("⚙", `Settings for ${timer.name}`, "settings", timer.id));
  if (timer.runtime.status === "awaitingContinue") {
    controls.append(actionButton("▶", `Continue ${timer.name}`, "continue", timer.id));
  } else if (timer.runtime.status === "running") {
    controls.append(actionButton("Ⅱ", `Pause ${timer.name}`, "pause", timer.id));
  } else {
    controls.append(actionButton("▶", `Start ${timer.name}`, "start", timer.id));
  }
  card.append(heading, face, controls);
  return card;
}

export function renderSections(state, root, now = Date.now()) {
  const timersBySection = new Map(state.sections.map(({ id }) => [id, []]));
  for (const timer of state.timers) timersBySection.get(timer.sectionId)?.push(timer);
  const fragment = document.createDocumentFragment();
  for (const section of state.sections) {
    const timers = timersBySection.get(section.id);
    const wrapper = element("section", "timer-section");
    const sectionHeading = element("div", "section-heading");
    const title = element("h2", "", section.name);
    title.id = `section-${section.id}`;
    sectionHeading.append(title, actionButton("⚙", `Settings for ${section.name}`, "section-settings", section.id));
    wrapper.setAttribute("aria-labelledby", title.id);
    const grid = element("div", "timer-grid");
    for (const timer of timers) grid.append(createTimerCard(timer, now));
    wrapper.append(sectionHeading, grid);
    fragment.append(wrapper);
  }
  if (!state.timers.length) {
    fragment.append(element("p", "empty-state", "Create a timer to begin your routine."));
  }
  root.replaceChildren(fragment);
}

export function configureTimerDialog(dialog, { kind, timer, sections }) {
  const form = dialog.querySelector("form");
  form.reset();
  const selectedKind = timer?.kind ?? kind;
  form.elements.kind.value = selectedKind;
  form.querySelector('[data-fields="normal"]').hidden = selectedKind !== "normal";
  form.querySelector('[data-fields="pomodoro"]').hidden = selectedKind !== "pomodoro";
  dialog.querySelector("#timer-dialog-title").textContent = timer ? "Timer settings" : "Create timer";
  form.querySelector('[data-action="delete-timer"]').hidden = !timer;
  const sectionSelect = form.elements.sectionId;
  sectionSelect.replaceChildren(...sections.map(({ id, name }) => {
    const option = element("option", "", name);
    option.value = id;
    return option;
  }));
  const colors = form.elements.color;
  colors.replaceChildren(...TIMER_COLORS.map((color) => {
    const option = element("option", "", color[0].toUpperCase() + color.slice(1));
    option.value = color;
    return option;
  }));
  if (timer) {
    form.elements.name.value = timer.name;
    form.elements.emoji.value = timer.emoji;
    form.elements.sectionId.value = timer.sectionId;
    form.elements.color.value = timer.color;
    if (timer.kind === "normal") {
      const totalMinutes = Math.floor(timer.config.durationMs / 60_000);
      form.elements.hours.value = Math.floor(totalMinutes / 60);
      form.elements.minutes.value = totalMinutes % 60;
    } else {
      form.elements.pomodoroHours.value = timer.config.hours;
      form.elements.restMinutes.value = timer.config.restMinutes;
      form.elements.autoAdvance.checked = timer.config.autoAdvance;
    }
  }
  dialog.showModal();
  form.elements.name.focus();
}

export function announce(message, root = document.querySelector("#announcer")) {
  root.textContent = "";
  requestAnimationFrame(() => { root.textContent = message; });
}
