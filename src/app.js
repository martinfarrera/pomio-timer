import {
  MINUTE_MS, createTimer, reconcileTimer, startAll, transitionTimer,
} from "./domain/timers.js";
import { loadState, normalizeState, saveState } from "./storage.js";
import { announce, configureTimerDialog, renderSections } from "./ui.js";
import { createAudioController } from "./audio.js";

function cleanName(value, label) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new RangeError(`${label} name is required`);
  return name;
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
  if (action.type === "timer/start-all") {
    return { ...state, timers: startAll(state.timers, now) };
  }
  if (action.type === "section/create") {
    const id = cleanName(action.id, "Section");
    if (state.sections.some((section) => section.id === id)) {
      throw new RangeError("Section already exists");
    }
    return {
      ...state,
      sections: [...state.sections, { id, name: cleanName(action.name, "Section") }],
    };
  }
  if (action.type === "section/update") {
    return {
      ...state,
      sections: state.sections.map((section) => section.id === action.id
        ? { ...section, name: cleanName(action.name, "Section") }
        : section),
    };
  }
  if (action.type === "section/delete") {
    if (action.id === "inbox") throw new RangeError("The default section cannot be deleted");
    return {
      ...state,
      sections: state.sections.filter(({ id }) => id !== action.id),
      timers: state.timers.map((timer) => timer.sectionId === action.id
        ? { ...timer, sectionId: "inbox" }
        : timer),
    };
  }
  if (action.type === "audio/update") {
    return normalizeState({ ...state, audio: { ...state.audio, ...action.audio } });
  }
  throw new RangeError(`Unknown application action: ${action.type}`);
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

function makeSectionId(state, name) {
  const base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
  let id = base;
  for (let index = 2; state.sections.some((section) => section.id === id); index += 1) {
    id = `${base}-${index}`;
  }
  return id;
}

export function bootstrap(
  doc = document,
  storage = globalThis.localStorage,
  audio = createAudioController(),
) {
  const sectionsRoot = doc.querySelector("#sections");
  const timerDialog = doc.querySelector("#timer-dialog");
  const sectionDialog = doc.querySelector("#section-dialog");
  const soundsDialog = doc.querySelector("#sounds-dialog");
  let state = loadState(storage);
  let editingTimerId = null;
  let editingSectionId = null;
  audio.setSettings(state.audio);

  const render = (now = Date.now()) => renderSections(state, sectionsRoot, now);
  const commit = (next, message) => {
    state = normalizeState(next);
    saveState(state, storage);
    render();
    if (message) announce(message, doc.querySelector("#announcer"));
  };
  const openTimer = (kind, timer = null) => {
    editingTimerId = timer?.id ?? null;
    configureTimerDialog(timerDialog, { kind, timer, sections: state.sections });
  };
  const openSection = (section = null) => {
    editingSectionId = section?.id ?? null;
    const form = sectionDialog.querySelector("form");
    form.reset();
    form.elements.name.value = section?.name ?? "";
    form.querySelector('[data-action="delete-section"]').hidden = !section || section.id === "inbox";
    sectionDialog.querySelector("h2").textContent = section ? "Section settings" : "Create section";
    sectionDialog.showModal();
    form.elements.name.focus();
  };

  doc.addEventListener("click", (event) => {
    void audio.unlock();
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    try {
      if (action === "toggle-create") {
        const menu = doc.querySelector("#create-menu");
        menu.hidden = !menu.hidden;
        target.setAttribute("aria-expanded", String(!menu.hidden));
      } else if (action === "create-normal" || action === "create-pomodoro") {
        doc.querySelector("#create-menu").hidden = true;
        openTimer(action === "create-normal" ? "normal" : "pomodoro");
      } else if (action === "open-sounds") {
        const form = soundsDialog.querySelector("form");
        for (const [key, value] of Object.entries(state.audio)) {
          if (form.elements[key]) form.elements[key][typeof value === "boolean" ? "checked" : "value"] = value;
        }
        soundsDialog.showModal();
      } else if (action === "new-section") openSection();
      else if (action === "section-settings") {
        openSection(state.sections.find(({ id }) => id === target.dataset.timerId));
      } else if (action === "settings") {
        const timer = state.timers.find(({ id }) => id === target.dataset.timerId);
        openTimer(timer.kind, timer);
      } else if (["start", "pause", "reset", "continue"].includes(action)) {
        if (action === "continue" || action === "reset") audio.stopAlert();
        commit(reduceApp(state, {
          type: "timer/control", id: target.dataset.timerId, command: action,
        }), `${action} applied`);
        if (action === "start") audio.playPhaseBell({ repeat: false });
      } else if (action === "start-all") {
        commit(reduceApp(state, { type: "timer/start-all" }), "All idle timers started");
      } else if (action === "delete-timer") {
        commit(reduceApp(state, { type: "timer/delete", id: editingTimerId }), "Timer deleted");
        timerDialog.close();
      } else if (action === "delete-section") {
        commit(reduceApp(state, { type: "section/delete", id: editingSectionId }), "Section deleted");
        sectionDialog.close();
      }
    } catch (error) {
      announce(error.message, doc.querySelector("#announcer"));
    }
  });

  doc.querySelector("#timer-form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const timer = {
      name: data.name, emoji: data.emoji, color: data.color,
      sectionId: data.sectionId, kind: data.kind,
      config: data.kind === "normal"
        ? { durationMs: (Number(data.hours) * 60 + Number(data.minutes)) * MINUTE_MS }
        : {
            hours: Number(data.pomodoroHours), restMinutes: Number(data.restMinutes),
            autoAdvance: event.currentTarget.elements.autoAdvance.checked,
          },
    };
    try {
      const action = editingTimerId
        ? { type: "timer/update", id: editingTimerId, changes: timer }
        : { type: "timer/create", timer };
      commit(reduceApp(state, action), editingTimerId ? "Timer updated" : "Timer created");
      timerDialog.close();
    } catch (error) { announce(error.message, doc.querySelector("#announcer")); }
  });

  doc.querySelector("#section-form").addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const name = event.currentTarget.elements.name.value;
    const action = editingSectionId
      ? { type: "section/update", id: editingSectionId, name }
      : { type: "section/create", id: makeSectionId(state, name), name };
    try { commit(reduceApp(state, action), "Section saved"); sectionDialog.close(); }
    catch (error) { announce(error.message, doc.querySelector("#announcer")); }
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
    } }), "Sound settings saved");
    audio.setSettings(state.audio);
    soundsDialog.close();
  });

  const tick = () => {
    const now = Date.now();
    const result = reconcileAppState(state, now);
    if (result.transitions.length) {
      state = result.state;
      saveState(state, storage);
      const last = result.transitions.at(-1);
      audio.playPhaseBell({
        repeat: state.audio.repeatUntilContinue && last.status !== "completed",
      });
      announce(last.status === "completed" ? "Timer completed" : `${last.phase} started`, doc.querySelector("#announcer"));
    }
    render(now);
  };
  doc.addEventListener("visibilitychange", () => { if (!doc.hidden) tick(); });
  tick();
  setInterval(tick, 250);
}

if (typeof document !== "undefined") bootstrap();
