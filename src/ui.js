import {
  TIMER_COLORS, TIMER_COLOR_VALUES, getCurrentPhaseDisplay,
} from "./domain/timers.js?v=20260822.3";

const COLOR_LABELS = Object.freeze({
  coral: "coral",
  amber: "ámbar",
  yellow: "amarillo",
  mint: "menta",
  green: "verde",
  teal: "verde azulado",
  sky: "celeste",
  blue: "azul",
  lavender: "lavanda",
  rose: "rosa",
});

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

function colorOptions(name, selected) {
  return TIMER_COLORS.map((color) => {
    const label = element("label", "color-swatch");
    label.title = COLOR_LABELS[color];
    const input = element("input");
    input.type = "radio";
    input.name = name;
    input.value = color;
    input.checked = color === selected;
    input.setAttribute("aria-label", COLOR_LABELS[color]);
    const tone = element("span", "color-tone");
    tone.setAttribute("aria-hidden", "true");
    tone.style.setProperty("--swatch", TIMER_COLOR_VALUES[color]);
    label.append(input, tone);
    return label;
  });
}

export function setTimerMode(form, kind) {
  form.elements.kind.value = kind;
  for (const mode of ["normal", "pomodoro"]) {
    const fields = form.querySelector(`[data-fields="${mode}"]`);
    const active = mode === kind;
    fields.hidden = !active;
    for (const control of fields.querySelectorAll("input, select")) {
      control.disabled = !active;
    }
  }
}

export function createTimerCard(timer, now = Date.now()) {
  const display = getCurrentPhaseDisplay(timer, now);
  const card = element("article", "timer-card");
  card.dataset.timerId = timer.id;
  card.dataset.color = timer.color;
  card.dataset.dialColor = timer.dialColor;
  card.dataset.phase = timer.runtime.phase ?? "normal";
  card.style.setProperty("--progress-angle", `${display.progress * 360}deg`);

  const face = element("div", "timer-face");
  face.setAttribute("role", "timer");
  face.setAttribute("aria-label", `${display.minutes} minutos y ${display.seconds} segundos`);

  const time = element("div", "time-display");
  if (timer.emoji) time.append(element("span", "timer-emoji", timer.emoji));
  const values = element("div", "time-values");
  values.append(
    element("span", "time-minutes", display.minutes),
    element("span", "time-separator", ":"),
    element("span", "time-seconds", display.seconds),
  );
  const title = element("h3", "timer-title", timer.name);
  time.append(values, title);
  if (timer.kind === "pomodoro") {
    time.append(element(
      "span",
      "cycle-label",
      `Pomodoro · ${timer.runtime.cycleIndex + 1}/${timer.config.hours}`,
    ));
  } else {
    time.append(element("span", "cycle-label", "Timer"));
  }
  face.append(time);

  const controls = element("div", "timer-actions");
  controls.append(actionButton("↺", `Reiniciar ${timer.name}`, "reset", timer.id));
  controls.append(actionButton("⚙", `Configurar ${timer.name}`, "settings", timer.id));
  if (timer.runtime.status === "awaitingContinue") {
    controls.append(actionButton("▶", `Continuar ${timer.name}`, "continue", timer.id));
  } else if (timer.runtime.status === "running") {
    controls.append(actionButton("Ⅱ", `Pausar ${timer.name}`, "pause", timer.id));
  } else {
    controls.append(actionButton("▶", `Iniciar ${timer.name}`, "start", timer.id));
  }
  card.append(face, controls);
  return card;
}

export function renderTimers(state, root, now = Date.now()) {
  const fragment = document.createDocumentFragment();
  const grid = element("div", "timer-grid");
  for (const timer of state.timers) grid.append(createTimerCard(timer, now));
  if (state.timers.length) fragment.append(grid);
  else fragment.append(element("p", "empty-state", "Crea un temporizador para comenzar tu rutina."));
  root.replaceChildren(fragment);
}

export function configureTimerDialog(dialog, { timer = null } = {}) {
  const form = dialog.querySelector("form");
  form.reset();
  const kind = timer?.kind ?? "normal";
  setTimerMode(form, kind);
  dialog.querySelector("#timer-dialog-title").textContent = timer
    ? "Configurar temporizador"
    : "Crear temporizador";
  form.querySelector('[data-action="delete-timer"]').hidden = !timer;

  const color = timer?.color ?? "coral";
  const dialColor = timer?.dialColor ?? color;
  form.querySelector('[data-color-options="color"]').replaceChildren(
    ...colorOptions("color", color),
  );
  form.querySelector('[data-color-options="dialColor"]').replaceChildren(
    ...colorOptions("dialColor", dialColor),
  );

  if (timer) {
    form.elements.name.value = timer.name;
    form.elements.emoji.value = timer.emoji;
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
