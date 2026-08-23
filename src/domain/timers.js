export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const REST_MINUTES = Object.freeze([5, 10, 15, 20]);
export const TIMER_COLORS = Object.freeze([
  "coral", "amber", "yellow", "mint", "green",
  "teal", "sky", "blue", "lavender", "rose",
]);
export const TIMER_COLOR_VALUES = Object.freeze({
  coral: "#b95747",
  amber: "#9a5f18",
  yellow: "#7e6a12",
  mint: "#37785a",
  green: "#36724a",
  teal: "#28746e",
  sky: "#337497",
  blue: "#3468aa",
  lavender: "#6c58a3",
  rose: "#9f4f69",
});

const STATUSES = new Set([
  "idle", "running", "paused", "awaitingContinue", "completed",
]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} debe ser un objeto`);
  }
}

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ??
    `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getPomodoroDurations(hours, restMinutes) {
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new RangeError("La duración Pomodoro debe ser un número entero positivo de horas");
  }
  if (!REST_MINUTES.includes(restMinutes)) {
    throw new RangeError("El descanso debe ser de 5, 10, 15 o 20 minutos");
  }
  return {
    cycles: hours,
    focusMs: (60 - restMinutes) * MINUTE_MS,
    restMs: restMinutes * MINUTE_MS,
  };
}

export function validateTimerInput(input) {
  assertObject(input, "El temporizador");
  assertObject(input.config, "La configuración del temporizador");
  const name = cleanText(input.name);
  if (!name) throw new RangeError("El nombre del temporizador es obligatorio");
  if (input.kind !== "normal" && input.kind !== "pomodoro") {
    throw new RangeError("El tipo debe ser normal o Pomodoro");
  }

  let config;
  if (input.kind === "normal") {
    const { durationMs } = input.config;
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      throw new RangeError("La duración del temporizador debe ser mayor que cero");
    }
    config = { durationMs };
  } else {
    const { hours, restMinutes } = input.config;
    getPomodoroDurations(hours, restMinutes);
    config = { hours, restMinutes, autoAdvance: input.config.autoAdvance !== false };
  }

  const color = cleanText(input.color, "coral") || "coral";
  if (!TIMER_COLORS.includes(color)) {
    throw new RangeError(`El color del temporizador debe ser uno de: ${TIMER_COLORS.join(", ")}`);
  }
  const dialColor = cleanText(input.dialColor, color) || color;
  if (!TIMER_COLORS.includes(dialColor)) {
    throw new RangeError(`El color del dial debe ser uno de: ${TIMER_COLORS.join(", ")}`);
  }
  return {
    id: cleanText(input.id) || makeId(),
    name,
    emoji: cleanText(input.emoji),
    color,
    dialColor,
    sectionId: cleanText(input.sectionId, "inbox") || "inbox",
    kind: input.kind,
    config,
  };
}

function phaseDuration(timer, phase = timer.runtime.phase) {
  if (timer.kind === "normal") return timer.config.durationMs;
  const { focusMs, restMs } = getPomodoroDurations(
    timer.config.hours, timer.config.restMinutes,
  );
  return phase === "focus" ? focusMs : restMs;
}

function initialRuntime(timer) {
  return {
    status: "idle",
    phase: timer.kind === "pomodoro" ? "focus" : null,
    cycleIndex: 0,
    remainingMs: phaseDuration({ ...timer, runtime: { phase: "focus" } }),
    deadlineEpochMs: null,
  };
}

export function createTimer(input) {
  const timer = validateTimerInput(input);
  return { ...timer, runtime: initialRuntime(timer) };
}

function assertRuntime(timer) {
  assertObject(timer, "El temporizador");
  assertObject(timer.runtime, "El estado del temporizador");
  if (!STATUSES.has(timer.runtime.status)) {
    throw new RangeError(`Estado desconocido del temporizador: ${timer.runtime.status}`);
  }
}

function nextStep(timer) {
  if (timer.kind === "normal") return null;
  if (timer.runtime.phase === "focus") {
    return { phase: "rest", cycleIndex: timer.runtime.cycleIndex };
  }
  return timer.runtime.cycleIndex + 1 < timer.config.hours
    ? { phase: "focus", cycleIndex: timer.runtime.cycleIndex + 1 }
    : null;
}

function crossBoundary(timer, atEpochMs, forceWait) {
  const next = nextStep(timer);
  if (!next) {
    const runtime = {
      ...timer.runtime, status: "completed", remainingMs: 0, deadlineEpochMs: null,
    };
    return { timer: { ...timer, runtime }, event: { ...runtime, atEpochMs } };
  }

  const nextTimer = { ...timer, runtime: { ...timer.runtime, ...next } };
  const remainingMs = phaseDuration(nextTimer);
  const running = timer.config.autoAdvance && !forceWait;
  const runtime = {
    ...nextTimer.runtime,
    status: running ? "running" : "awaitingContinue",
    remainingMs,
    deadlineEpochMs: running ? atEpochMs + remainingMs : null,
  };
  return { timer: { ...nextTimer, runtime }, event: { ...runtime, atEpochMs } };
}

export function reconcileTimer(timer, now = Date.now(), { forceWait = false } = {}) {
  assertRuntime(timer);
  if (!Number.isFinite(now)) throw new TypeError("La fecha debe ser una marca de tiempo válida");
  if (timer.runtime.status !== "running") return { timer, transitions: [] };

  let current = timer;
  const transitions = [];
  while (current.runtime.status === "running" && now >= current.runtime.deadlineEpochMs) {
    const result = crossBoundary(current, current.runtime.deadlineEpochMs, forceWait);
    current = result.timer;
    transitions.push(result.event);
    if (current.runtime.status !== "running") break;
  }
  if (current.runtime.status === "running") {
    current = {
      ...current,
      runtime: {
        ...current.runtime,
        remainingMs: Math.max(0, current.runtime.deadlineEpochMs - now),
      },
    };
  }
  return { timer: current, transitions };
}

export function transitionTimer(timer, action, now = Date.now()) {
  assertRuntime(timer);
  if (!Number.isFinite(now)) throw new TypeError("La fecha debe ser una marca de tiempo válida");
  if (action === "reset") return { ...timer, runtime: initialRuntime(timer) };

  if (action === "pause") {
    const current = reconcileTimer(timer, now).timer;
    if (current.runtime.status !== "running") return current;
    return {
      ...current,
      runtime: {
        ...current.runtime,
        status: "paused",
        remainingMs: Math.max(0, current.runtime.deadlineEpochMs - now),
        deadlineEpochMs: null,
      },
    };
  }

  const allowed =
    (action === "start" && ["idle", "paused"].includes(timer.runtime.status)) ||
    (action === "continue" && timer.runtime.status === "awaitingContinue");
  if (allowed) {
    return {
      ...timer,
      runtime: {
        ...timer.runtime,
        status: "running",
        deadlineEpochMs: now + timer.runtime.remainingMs,
      },
    };
  }
  if (action === "start" || action === "continue") return timer;
  throw new RangeError(`Acción desconocida del temporizador: ${action}`);
}

export function getCurrentPhaseDisplay(timer, now = Date.now()) {
  assertRuntime(timer);
  const current = reconcileTimer(timer, now).timer;
  const remainingMs = current.runtime.status === "running"
    ? Math.max(0, current.runtime.deadlineEpochMs - now)
    : current.runtime.remainingMs;
  const totalSeconds = Math.ceil(remainingMs / SECOND_MS);
  return {
    minutes: String(Math.floor(totalSeconds / 60)).padStart(2, "0"),
    seconds: String(totalSeconds % 60).padStart(2, "0"),
    remainingMs,
    progress: Number((remainingMs / phaseDuration(current)).toFixed(5)),
  };
}
