import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, ui] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/app.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui.js", import.meta.url), "utf8"),
]);

test("the visible shell is Spanish and removes section and bulk controls", () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>Temporizador Pomio<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/png" href="assets\/favicon\.png\?v=[^"]+">/);
  assert.doesNotMatch(html, /<img\b[^>]*favicon/i);
  assert.match(html, /Crear temporizador/);
  assert.match(html, /Sonidos/);
  assert.doesNotMatch(html, /My timers|Start all|section-dialog|create-menu/i);
  assert.doesNotMatch(ui, /Settings for|Create a timer|minutes .* seconds/i);
});

test("timer kind labels distinguish normal timers from Pomodoros", () => {
  assert.match(ui, /`\$\{timer\.runtime\.cycleIndex \+ 1\}\/\$\{timer\.config\.hours\}`/);
  assert.doesNotMatch(ui, /Pomodoro ·/);
  assert.match(ui, /else \{\s*content\.append\(element\("span", "cycle-label", "Timer"\)\);/);
});

test("the emoji and dial content use the requested vertical spacing", () => {
  assert.match(ui, /const content = element\("div", "time-content"\);\s*if \(timer\.emoji\) content\.append\(element\("span", "timer-emoji", timer\.emoji\)\);/);
  assert.doesNotMatch(ui, /title\.append\(element\("span", "timer-emoji"/);
  assert.match(css, /\.time-display \{[\s\S]*padding: 4px 5px 1px;/);
  assert.match(css, /\.time-content \{[\s\S]*transform: translateY\(10px\);/);
  assert.match(css, /\.timer-emoji \{ padding-bottom: 5px;/);
  assert.doesNotMatch(css, /\.timer-emoji \{[^}]*margin-bottom/);
});

test("every dialog close and cancel path bypasses required-field validation", () => {
  const closeButtons = [...html.matchAll(
    /<button\b[^>]*data-action="close-dialog"[^>]*>/g,
  )].map(([button]) => button);
  assert.equal(closeButtons.length, 4);
  for (const button of closeButtons) assert.match(button, /type="button"/);
  for (const [, attributes] of html.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(attributes, /type="(?:button|submit)"/);
  }
});

test("one dialog owns mode selection and separate circular color choices", () => {
  assert.equal((html.match(/<dialog id="timer-dialog"/g) ?? []).length, 1);
  assert.match(html, /Horas y minutos/);
  assert.match(html, /Horas completas con descanso/);
  assert.match(html, /data-color-options="color"/);
  assert.match(html, /data-color-options="dialColor"/);
  assert.match(css, /\.color-tone[\s\S]*border-radius: 50%/);
});

test("compact header and rounded-square side-by-side dial are encoded in CSS", () => {
  assert.match(html, /data-action="create-timer"/);
  assert.match(html, /<span class="header-icon"[^>]*>◷<\/span>/);
  assert.match(css, /@media \(max-width: 260px\)[\s\S]*\.header-text \{ display: none; \}/);
  assert.match(css, /\.timer-face[\s\S]*border-radius: 28%/);
  assert.match(css, /\.time-values \{ display: flex/);
  assert.match(css, /\.time-minutes \{ font-size: clamp\(1\.485rem, 19\.8vw, 2\.205rem\); \}/);
  assert.match(css, /\.time-seconds \{ font-size: clamp\(\.84rem, 11\.2vw, 1\.16rem\);/);
  assert.doesNotMatch(css, /data-phase="focus"/);
  assert.match(css, /data-phase="rest"/);
});

test("fan and 40 Hz gamma wave are available without claims", () => {
  assert.match(html, /<option value="fan">Ventilador<\/option>/);
  assert.match(html, /<option value="gamma">Onda gamma \(40 Hz\)<\/option>/);
  assert.doesNotMatch(html, /cura|salud|terapia|concentración|beneficio/i);
});
