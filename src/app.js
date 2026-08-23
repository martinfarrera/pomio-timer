import {
  MINUTE_MS, createTimer, reconcileTimer, transitionTimer,
} from "./domain/timers.js?v=20260822.6";
import { loadState, normalizeState, saveState } from "./storage.js?v=20260822.6";
import {
  announce, configureTimerDialog, renderTimers, setTimerMode,
} from "./ui.js?v=20260822.6";
import { createAudioController } from "./audio.js?v=20260822.6";

export function hasRunningTimers(state) {
  return state.timers.some(({ runtime }) => runtime.status === "running");
}

export function syncAudioActivity(audio, state) {
  audio.setActive(hasRunningTimers(state));
}

export function reduceApp(state, action, now = Date.now()) {
  if (action.type === "timer/create") {
    return { ...state, timers: [...state.timers, createTimer(action.timer)] };
  }
  if (action.type === "timer/update") {
    return {
      ...state,
      timers: state.timers.map((timer) => timer.id === action.id
        ? createTimer({ ...timer, ...action.changes, id: timer.id })
        : timer),
    };
  }
  if (action.type === "timer/delete") {
    return { ...state, timers: state.timers.filter(({ id }) => id !== action.id) };
  }
  if (action.type === "timer/control") {
    return {
      ...state,
      timers: state.timers.map((timer) => timer.id === action.id
        ? transitionTimer(timer, action.command, now)
        : timer),
    };
  }
  if (action.type === "audio/update") {
    return normalizeState({ ...state, audio: { ...state.audio, ...action.audio } });
  }
  throw new RangeError(`Acción desconocida de la aplicación: ${action.type}`);
}

export function reconcileAppState(state, now = Date.now()) {
  const transitions = [];
  const timers = state.timers.map((timer) => {
    const result = reconcileTimer(timer, now, {
      forceWait: state.audio.repeatUntilContinue,
    });
    transitions.push(...result.transitions.map((event) => ({ ...event, timerId: timer.id })));
    return result.transitions.length ? result.timer : timer;
  });
  return { state: transitions.length ? { ...state, timers } : state, transitions };
}

function transitionAnnouncement(transition) {
  if (transition.status === "completed") return "Temporizador completado";
  return transition.phase === "rest" ? "Descanso iniciado" : "Enfoque iniciado";
}

export function bootstrap(
  doc = document,
  storage = globalThis.localStorage,
  audio = createAudioController(),
) {
  const timersRoot = doc.querySelector("#timers");
  const timerDialog = doc.querySelector("#timer-dialog");
  const soundsDialog = doc.querySelector("#sounds-dialog");
  let state = loadState(storage);
  let editingTimerId = null;
  audio.setSettings(state.audio);
  syncAudioActivity(audio, state);

  const render = (now = Date.now()) => renderTimers(state, timersRoot, now);
  const commit = (next, message) => {
    state = normalizeState(next);
    saveState(state, storage);
    syncAudioActivity(audio, state);
    render();
    if (message) announce(message, doc.querySelector("#announcer"));
  };
  const openTimer = (timer = null) => {
    editingTimerId = timer?.id ?? null;
    configureTimerDialog(timerDialog, { timer });
  };

  doc.addEventListener("click", (event) => {
    void audio.unlock();
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    try {
      if (action === "create-timer") {
        openTimer();
      } else if (action === "open-sounds") {
        const form = soundsDialog.querySelector("form");
        for (const [key, value] of Object.entries(state.audio)) {
          if (form.elements[key]) {
            form.elements[key][typeof value === "boolean" ? "checked" : "value"] = value;
          }
        }
        soundsDialog.showModal();
      } else if (action === "close-dialog") {
        target.closest("dialog")?.close();
      } else if (action === "settings") {
        const timer = state.timers.find(({ id }) => id === target.dataset.timerId);
        if (timer) openTimer(timer);
      } else if (["start", "pause", "reset", "continue"].includes(action)) {
        if (action === "continue" || action === "reset") audio.stopAlert();
        commit(reduceApp(state, {
          type: "timer/control", id: target.dataset.timerId, command: action,
        }), {
          start: "Temporizador iniciado",
          pause: "Temporizador pausado",
          reset: "Temporizador reiniciado",
          continue: "Temporizador reanudado",
        }[action]);
        if (action === "start") audio.playPhaseBell({ repeat: false });
      } else if (action === "delete-timer") {
        audio.stopAlert();
        commit(
          reduceApp(state, { type: "timer/delete", id: editingTimerId }),
          "Temporizador eliminado",
        );
        timerDialog.close();
      }
    } catch (error) {
      announce(error.message, doc.querySelector("#announcer"));
    }
  });

  doc.querySelector("#timer-form").addEventListener("change", (event) => {
    if (event.target.name === "kind") setTimerMode(event.currentTarget, event.target.value);
  });

  doc.querySelector("#timer-form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const timer = {
      name: data.name,
      emoji: data.emoji,
      color: data.color,
      dialColor: data.dialColor,
      kind: data.kind,
      config: data.kind === "normal"
        ? { durationMs: (Number(data.hours) * 60 + Number(data.minutes)) * MINUTE_MS }
        : {
            hours: Number(data.pomodoroHours),
            restMinutes: Number(data.restMinutes),
            autoAdvance: event.currentTarget.elements.autoAdvance.checked,
          },
    };
    try {
      const action = editingTimerId
        ? { type: "timer/update", id: editingTimerId, changes: timer }
        : { type: "timer/create", timer };
      commit(
        reduceApp(state, action),
        editingTimerId ? "Temporizador actualizado" : "Temporizador creado",
      );
      timerDialog.close();
    } catch (error) {
      announce(error.message, doc.querySelector("#announcer"));
    }
  });

  doc.querySelector("#sounds-form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const form = event.currentTarget;
    commit(reduceApp(state, { type: "audio/update", audio: {
      noise: form.elements.noise.value,
      noiseVolume: Number(form.elements.noiseVolume.value),
      alertVolume: Number(form.elements.alertVolume.value),
      repeatUntilContinue: form.elements.repeatUntilContinue.checked,
    } }), "Configuración de sonido guardada");
    audio.setSettings(state.audio);
    soundsDialog.close();
  });

  const tick = () => {
    const now = Date.now();
    const result = reconcileAppState(state, now);
    if (result.transitions.length) {
      state = result.state;
      saveState(state, storage);
      syncAudioActivity(audio, state);
      const last = result.transitions.at(-1);
      audio.playPhaseBell({
        repeat: state.audio.repeatUntilContinue && last.status !== "completed",
      });
      announce(transitionAnnouncement(last), doc.querySelector("#announcer"));
    }
    render(now);
  };
  doc.addEventListener("visibilitychange", () => { if (!doc.hidden) tick(); });
  tick();
  setInterval(tick, 250);
}

if (typeof document !== "undefined") bootstrap();
