// Collaborative mode: the recipe active at the video's current time.
const root = document.getElementById("table-demo");
const video = root.querySelector("video");
const mix = root.querySelector(".mix");
const message = root.querySelector(".recipe");

function loadReadouts() {
  const { recipes, prompts, combo } = JSON.parse(document.getElementById("table-session-data").textContent);
  if (!recipes.length) throw new Error("No recipes in the table session.");
  const rows = new Map();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const [prompt, color] of prompts) {
    const term = document.createElement("dt");
    term.textContent = prompt;
    term.style.setProperty("--mix-color", color);
    const detail = document.createElement("dd");
    const bar = document.createElement("meter");
    bar.min = 0;
    bar.max = 1;
    bar.setAttribute("aria-label", prompt);
    bar.style.setProperty("--mix-color", color);
    const share = document.createElement("span");
    detail.append(bar, share);
    mix.append(term, detail);
    rows.set(prompt, { bar, share, color });
  }

  // When the combo forms or splits, the member bars move between their own rows and the
  // two halves of the combo bar. Updates during the move retarget it to the new widths.
  let flight = null;
  function clearFlight() {
    if (!flight) return;
    flight.group.remove();
    flight = null;
    delete mix.dataset.flying;
  }

  function segment(prompt, values, part = 0, parts = 1) {
    const { bar, color } = rows.get(prompt);
    const origin = mix.getBoundingClientRect();
    const box = bar.getBoundingClientRect();
    const width = (values.get(prompt) * box.width) / parts;
    return {
      left: `${box.left - origin.left + width * part}px`,
      top: `${box.top - origin.top}px`,
      width: `${width}px`,
      backgroundColor: color,
    };
  }

  // A member's own bar and its half of the combo bar, in the order of the move.
  function endpoints(forming, before, after, prompt, index) {
    const single = segment(prompt, forming ? before : after);
    const joined = segment(combo.prompt, forming ? after : before, index, combo.members.length);
    return forming ? [single, joined] : [joined, single];
  }

  function animateCombo(forming, before, after) {
    clearFlight();
    const group = document.createElement("span");
    group.className = "mix-flight";
    group.setAttribute("aria-hidden", "true");
    mix.append(group);
    mix.dataset.flying = forming ? "merge" : "split";
    const pieces = combo.members.map((prompt, index) => {
      const piece = document.createElement("span");
      group.append(piece);
      const animation = piece.animate(endpoints(forming, before, after, prompt, index), {
        duration: 420 / Math.abs(video.playbackRate || 1),
        easing: "ease-in-out",
        fill: "forwards",
      });
      return { prompt, index, animation };
    });
    flight = { group, forming, before, pieces };
    Promise.allSettled(pieces.map(({ animation }) => animation.finished)).then(() => {
      if (flight?.group === group) clearFlight();
    });
  }

  function retargetFlight(after) {
    for (const { prompt, index, animation } of flight.pieces) {
      animation.effect.setKeyframes(endpoints(flight.forming, flight.before, after, prompt, index));
    }
  }

  for (const prompt of combo.members) rows.get(prompt).bar.classList.add("mix-member");
  rows.get(combo.prompt).bar.classList.add("mix-combo");

  let last = -1;
  let previousTime = null;
  function render(time = video.currentTime) {
    const continuous = previousTime !== null && time >= previousTime && time - previousTime < 0.5;
    previousTime = time;
    let lo = 0;
    let hi = recipes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (recipes[mid][0] <= time) lo = mid;
      else hi = mid - 1;
    }
    if (lo === last) return;
    const recipe = recipes[lo][1];
    const total = Object.values(recipe).reduce((sum, weight) => sum + weight, 0);
    const before = new Map();
    const after = new Map();
    for (const [prompt, { bar, share }] of rows) {
      const portion = total > 0 ? (recipe[prompt] ?? 0) / total : 0;
      before.set(prompt, bar.value);
      after.set(prompt, portion);
      bar.value = portion;
      share.textContent = `${Math.round(portion * 100)}%`;
    }
    const forming = after.get(combo.prompt) > 0;
    if (continuous && last >= 0 && forming !== (before.get(combo.prompt) > 0) &&
        !video.paused && !video.seeking && !reducedMotion.matches) {
      animateCombo(forming, before, after);
    } else if (flight) {
      retargetFlight(after);
    }
    last = lo;
    // "body" and "recipe" share a line so the JSON fits beside the video.
    const weights = Object.entries(recipe).map(([prompt, weight]) => `    ${JSON.stringify(prompt)}: ${weight}`);
    message.textContent = `{\n  "type": "UpdateRecipe",\n  "body": {"recipe": {\n${weights.join(",\n")}\n  }}\n}`;
  }

  if (video.requestVideoFrameCallback) {
    const trackFrame = (_, { mediaTime }) => {
      render(mediaTime);
      video.requestVideoFrameCallback(trackFrame);
    };
    video.requestVideoFrameCallback(trackFrame);
  } else {
    video.addEventListener("timeupdate", () => render());
  }
  for (const event of ["loadeddata", "seeked", "pause", "ended"]) {
    video.addEventListener(event, () => render());
  }
  video.addEventListener("seeking", () => {
    previousTime = null;
    clearFlight();
  });
  for (const event of ["pause", "ended"]) video.addEventListener(event, clearFlight);
  reducedMotion.addEventListener("change", clearFlight);
  render();
}

try {
  loadReadouts();
} catch (error) {
  message.textContent = "Could not load the synchronized recipe.";
  console.error(error);
}
