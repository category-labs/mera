import "@fontsource-variable/jetbrains-mono";
import { reportHeightWhenEmbedded } from "./embed";
import { deriveModel, type ModelInputs, type ModelResult } from "./model";
import { readHash, writeHash } from "./state";
import "./styles.css";

function elementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const inputs: {
  rpId: HTMLInputElement;
  salt: HTMLInputElement;
  passkey: HTMLSelectElement;
} = {
  rpId: elementById<HTMLInputElement>("in-rp-id"),
  salt: elementById<HTMLInputElement>("in-salt"),
  passkey: elementById<HTMLSelectElement>("in-passkey"),
};
const entropyElement = elementById<HTMLOutputElement>("entropy");
const mnemonicElement = elementById<HTMLOListElement>("mnemonic");
const evmAddressElement = elementById<HTMLOutputElement>("evm-address");
const solanaAddressElement = elementById<HTMLOutputElement>("solana-address");
const fingerprintCanvas = elementById<HTMLCanvasElement>("fingerprint");
const errorElement = elementById<HTMLParagraphElement>("error");

const byteElements: HTMLSpanElement[] = [];
for (let rowIndex = 0; rowIndex < 4; rowIndex += 1) {
  const row = document.createElement("span");
  row.className = "byte-row";

  const offset = document.createElement("span");
  offset.className = "byte-offset";
  offset.textContent = (rowIndex * 8).toString(16).padStart(2, "0");
  row.appendChild(offset);

  for (let columnIndex = 0; columnIndex < 8; columnIndex += 1) {
    const byte = document.createElement("span");
    byte.className = "byte";
    row.appendChild(byte);
    byteElements.push(byte);
  }

  entropyElement.appendChild(row);
}

const mnemonicWords = Array.from({ length: 24 }, (_, index) => {
  const item = document.createElement("li");

  const number = document.createElement("span");
  number.className = "word-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const word = document.createElement("span");
  word.className = "word";

  item.append(number, word);
  mnemonicElement.appendChild(item);
  return word;
});

let previous: ModelResult | null = null;
let scheduled = false;

function readInputs(): ModelInputs {
  return {
    rpId: inputs.rpId.value,
    salt: inputs.salt.value,
    passkey: inputs.passkey.value,
  };
}

function setInputs(values: ModelInputs): void {
  for (const field of Object.keys(inputs) as Array<keyof ModelInputs>) {
    inputs[field].value = values[field];
  }
}

function animateChange(element: HTMLElement): void {
  element.classList.remove("changed");
  void element.offsetWidth;
  element.classList.add("changed");
}

function setAnimatedText(element: HTMLElement, value: string): void {
  if (element.textContent === value) return;
  element.textContent = value;
  if (previous) animateChange(element);
}

function drawFingerprint(fingerprint: Uint8Array): void {
  const context = fingerprintCanvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  const size = 112;
  const scale = Math.min(window.devicePixelRatio || 1, 3);
  const gridSize = 7;
  const padding = size * 0.12;
  const cellSize = (size - padding * 2) / gridSize;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();

  fingerprintCanvas.width = size * scale;
  fingerprintCanvas.height = size * scale;
  fingerprintCanvas.style.width = `${size}px`;
  fingerprintCanvas.style.height = `${size}px`;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = false;
  context.fillStyle = color || "#f50";

  for (let column = 0; column < gridSize; column += 1) {
    const sourceColumn = column < 4 ? column : 6 - column;
    for (let row = 0; row < gridSize; row += 1) {
      if (fingerprint[1 + sourceColumn * gridSize + row] >= 128) {
        context.fillRect(
          Math.round(padding + column * cellSize),
          Math.round(padding + row * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize),
        );
      }
    }
  }

  if (previous) animateChange(fingerprintCanvas);
}

function syncChips(values: ModelInputs): void {
  for (const group of document.querySelectorAll<HTMLElement>(".chips")) {
    const field = group.dataset.field as keyof ModelInputs | undefined;
    if (!field) continue;
    for (const chip of group.querySelectorAll<HTMLButtonElement>(".chip")) {
      chip.dataset.active = String(chip.dataset.value === values[field]);
    }
  }
}

function render(values: ModelInputs): void {
  try {
    const result = deriveModel(values);

    for (const [index, element] of byteElements.entries()) {
      const pair = result.entropyHex.slice(index * 2, index * 2 + 2);
      if (element.textContent !== pair) {
        element.textContent = pair;
        if (previous) animateChange(element);
      }
    }

    const words = result.mnemonic.split(" ");
    for (const [index, element] of mnemonicWords.entries()) {
      setAnimatedText(element, words[index] ?? "");
    }
    setAnimatedText(evmAddressElement, result.evmAddress);
    setAnimatedText(solanaAddressElement, result.solanaAddress);
    if (previous?.fingerprintHex !== result.fingerprintHex) {
      drawFingerprint(result.fingerprint);
    }

    previous = result;
    errorElement.hidden = true;
    errorElement.textContent = "";
  } catch (error) {
    errorElement.textContent =
      error instanceof Error ? error.message : "Unable to derive account data";
    errorElement.hidden = false;
  }
}

function update(): void {
  const values = readInputs();
  render(values);
  syncChips(values);
  history.replaceState(null, "", writeHash(values));
}

function scheduleUpdate(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    update();
  });
}

for (const input of Object.values(inputs)) {
  input.addEventListener("input", scheduleUpdate);
}

for (const group of document.querySelectorAll<HTMLElement>(".chips")) {
  const field = group.dataset.field as keyof ModelInputs | undefined;
  if (!field) continue;
  for (const chip of group.querySelectorAll<HTMLButtonElement>(".chip")) {
    chip.addEventListener("click", () => {
      inputs[field].value = chip.dataset.value ?? "";
      scheduleUpdate();
    });
  }
}

window.addEventListener("hashchange", () => {
  setInputs(readHash(location.hash));
  scheduleUpdate();
});

reportHeightWhenEmbedded();
setInputs(readHash(location.hash));
update();
