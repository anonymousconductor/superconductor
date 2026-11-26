// Conductor mode: replays the tempo estimator's snapshots (js/conducting-tempo-data.js)
// at the video's current time. Time axes run from -5 s to now, so a copy shifted back
// by T seconds ends at -T s, where its similarity is plotted.
(() => {
  const root = document.getElementById("tempo-demo");
  const video = root.querySelector("video");
  const motionSvg = root.querySelector(".motion-3d svg");
  const rotation = root.querySelector(".rotate input");
  const matchSvg = root.querySelector(".tempo-match svg");
  const bpmOutput = root.querySelector(".tempo-bpm output");
  const bpmLine = root.querySelector(".tempo-bpm");
  const { sampleRate: RATE, results } = window.CONDUCTING_TEMPO;
  const SAMPLES = 150;
  const MIN_LAG = 30;
  const MAX_LAG = 120;
  const style = getComputedStyle(root);
  const BLUE = style.getPropertyValue("--position").trim();
  const ORANGE = style.getPropertyValue("--shifted").trim();
  const AXIS = style.getPropertyValue("--axis").trim();
  const GRID = "#dde1e8";
  // The tempo printed in yellow in the video overlay, darkened to read on a light background.
  const VIDEO_YELLOW = "#e0b400";

  function el(parent, tag, attrs = {}, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  const path = points => points.length
    ? "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")
    : "";
  const tickLabel = s => s === 0 ? "now" : `−${-s} s`;
  // Seconds before now of sample i in the 150-sample window.
  const secondsAt = i => (i - (SAMPLES - 1)) / RATE;
  const axisStyle = { stroke: AXIS, "stroke-width": 1.2, fill: "none" };

  function shiftArrow(parent, now, back, seconds) {
    const [x1, y1] = now;
    const [x2, y2] = back;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = [[0, 0], [-8, -4], [-8, 4]].map(([dx, dy]) => [
      x2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y2 + dx * Math.sin(angle) + dy * Math.cos(angle),
    ]);
    el(parent, "path", { d: path([now, back]), stroke: ORANGE, "stroke-width": 2 });
    el(parent, "path", { d: path(head) + "Z", fill: ORANGE });
    el(parent, "text", {
      x: (x1 + x2) / 2, y: Math.max(y1, y2) + 14, "text-anchor": "middle",
      fill: ORANGE, "font-weight": 600,
    }, `shift ${seconds.toFixed(1)} s`);
  }

  // One range for both axes, so their amplitudes are comparable.
  const scaleOf = signal => Math.max(2, Math.ceil(Math.max(...signal.flat().map(Math.abs))));
  const clamp = v => Math.max(-1, Math.min(1, v));

  // 3D plot. X is time, Y is up (image y grows downward), Z points toward the viewer,
  // which is left in the video.
  function drawMotion(signal, correlation, lag, used, shift) {
    motionSvg.replaceChildren();
    const yaw = rotation.valueAsNumber * Math.PI / 180;
    const pitch = 40 * Math.PI / 180;
    const project = ([X, Y, Z]) => {
      const across = X * Math.cos(yaw) + Z * Math.sin(yaw);
      const depth = -X * Math.sin(yaw) + Z * Math.cos(yaw);
      return [195 + 92 * across, 188 - 70 * Y * Math.cos(pitch) + 92 * depth * Math.sin(pitch)];
    };
    const W = 1.4;
    const timeX = s => W * (1 + 2 * s / 5);
    el(motionSvg, "path", { d: path([[-W, -1, -1], [W, -1, -1], [W, -1, 1], [-W, -1, 1]].map(project)) + "Z", fill: "#e4e8ef" });
    el(motionSvg, "path", { d: path([[-W, -1, -1], [W, -1, -1], [W, 1, -1], [-W, 1, -1]].map(project)) + "Z", fill: "#f4f5f8", stroke: GRID });

    // Similarity is drawn on the ground in front of the box: 1 at the far edge, -1 at the near.
    const SIM_NEAR = 3.85;
    const simZ = v => 2.65 - 1.05 * v;
    const simAt = (s, v) => project([timeX(s), -1, simZ(v)]);
    el(motionSvg, "path", { d: path([simAt(-5, 1.1), simAt(0, 1.1), simAt(0, -1.1), simAt(-5, -1.1)]) + "Z", fill: "#e9ecf2" });
    el(motionSvg, "path", { d: [1, -1].map(v => "M" + simAt(-4, v).join(",") + "L" + simAt(-1, v).join(",")).join(""), stroke: GRID, fill: "none" });
    el(motionSvg, "path", { d: "M" + simAt(-4, 0).join(",") + "L" + simAt(-1, 0).join(","), stroke: "#1d2340", "stroke-width": 1.8, fill: "none" });
    el(motionSvg, "path", { d: "M" + simAt(-4, 0.5).join(",") + "L" + simAt(-1, 0.5).join(","), stroke: AXIS, "stroke-dasharray": "3 3", fill: "none" });
    for (const v of [1, 0, -1]) {
      const [x, y] = simAt(-4, v);
      el(motionSvg, "text", { x: x - 6, y: y + 4, "text-anchor": "end" }, v < 0 ? "−1" : String(v));
    }
    for (const [v, text] of [[1, "perfect match"], [0.5, "threshold"], [0, "no similarity"]]) {
      const [x, y] = simAt(-1, v);
      el(motionSvg, "text", { x: x + 6, y: y + 4 }, text);
    }
    const [lx, ly] = simAt(-5, 0);
    el(motionSvg, "text", { x: lx - 6, y: ly + 4, "text-anchor": "end", "font-weight": 600, fill: "#1d2340" }, "similarity");

    const timeAt = s => project([timeX(s), -1, SIM_NEAR]);
    el(motionSvg, "path", { d: path([timeAt(-5), timeAt(0)]), ...axisStyle });
    for (let s = -5; s <= 0; s++) {
      const [x, y] = timeAt(s);
      el(motionSvg, "path", { d: `M${x},${y}v5`, ...axisStyle });
      el(motionSvg, "text", { x, y: y + 17, "text-anchor": "middle" }, tickLabel(s));
    }
    // Arrow tips mark up and right.
    const axisArrow = (from, to) => {
      const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
      const head = [[0, 0], [-7, -3.5], [-7, 3.5]].map(([dx, dy]) => [
        to[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
        to[1] + dx * Math.sin(angle) + dy * Math.cos(angle),
      ]);
      el(motionSvg, "path", { d: path([from, to]), ...axisStyle });
      el(motionSvg, "path", { d: path(head) + "Z", fill: AXIS });
    };
    const bottom = project([-W, -1, -1]);
    const top = project([-W, 1.2, -1]);
    axisArrow(bottom, top);
    el(motionSvg, "text", { x: top[0], y: top[1] - 6, "text-anchor": "middle" }, "up");
    const upper = project([-W, 1.05, -1]);
    el(motionSvg, "text", { x: upper[0] - 8, y: upper[1] + 4, "text-anchor": "end" }, "vertical");
    const near = project([W, -1, 1]);
    const tip = project([W, -1, -1.3]);
    axisArrow(near, tip);
    el(motionSvg, "text", { x: tip[0] + 6, y: tip[1] + 2 }, "right");
    const side = project([W, -1, 0.2]);
    el(motionSvg, "text", { x: side[0] + 10, y: side[1] + 4 }, "horizontal");
    // Fit the viewBox to the box and labels, with room below for the shift arrow.
    const box = motionSvg.getBBox();
    if (box.width) motionSvg.setAttribute("viewBox", `${box.x - 4} ${box.y - 4} ${box.width + 8} ${box.height + 40}`);

    if (!signal) return;
    const scale = scaleOf(signal);
    const points = signal[0].map((x, i) => [timeX(secondsAt(i)), clamp(-signal[1][i] / scale), clamp(-x / scale)]);
    // The newest 5 - T seconds, moved back by `shift`. At the full shift they start at -5 s.
    const shifted = lag ? points.slice(lag).map(([, Y, Z], i) => [timeX(secondsAt(i + lag) - shift), Y, Z]) : [];
    const onWall = ([X, Y]) => [X, Y, -1];
    const onFloor = ([X, , Z]) => [X, -1, Z];
    for (const flatten of [onWall, onFloor]) {
      el(motionSvg, "path", { d: path(points.map(p => project(flatten(p)))), fill: "none", stroke: BLUE, "stroke-opacity": 0.4, "stroke-width": 1.4 });
      if (shifted.length) el(motionSvg, "path", { d: path(shifted.map(p => project(flatten(p)))), fill: "none", stroke: ORANGE, "stroke-opacity": 0.5, "stroke-width": 1.4 });
    }
    el(motionSvg, "path", { d: path(points.map(project)), fill: "none", stroke: BLUE, "stroke-width": 2.4, "stroke-linejoin": "round" });
    if (shifted.length) {
      el(motionSvg, "path", { d: path(shifted.map(project)), fill: "none", stroke: ORANGE, "stroke-width": 2, "stroke-linejoin": "round" });
      const [x0, y0] = timeAt(0);
      const [x1, y1] = timeAt(-shift);
      if (shift > 0.1) shiftArrow(motionSvg, [x0, y0 + 30], [x1, y1 + 30], shift);
    }
    const [ex, ey] = project(points.at(-1));
    el(motionSvg, "circle", { cx: ex, cy: ey, r: 4.5, fill: BLUE });

    if (!correlation) return;
    const [firstLag, scores] = correlation;
    const curve = [];
    for (let k = MIN_LAG; k <= MAX_LAG; k++) curve.push(simAt(-k / RATE, clamp(scores[k - firstLag])));
    el(motionSvg, "path", { d: path(curve), fill: "none", stroke: "#1d2340", "stroke-width": 1.6, "stroke-linejoin": "round" });
    if (lag && shift === lag / RATE) {
      const [x, y] = simAt(-shift, clamp(scores[lag - firstLag]));
      el(motionSvg, "circle", { cx: x, cy: y, r: 5, fill: used ? ORANGE : "white", stroke: ORANGE, "stroke-width": 2 });
    }
  }

  // Tempo figure.
  const LEFT = 70;
  const PER_SECOND = 118;
  const sx = s => LEFT + (s + 5) * PER_SECOND;
  // 50 to 150 BPM.
  const tempoY = bpm => 170 - (Math.max(50, Math.min(150, bpm)) - 50) * 1.5;
  const AXIS_Y = 182;
  const { smoothed } = window.CONDUCTING_TEMPO;

  function drawMatch(now) {
    matchSvg.replaceChildren();
    el(matchSvg, "path", { d: [50, 100, 150].map(v => `M${sx(-5)},${tempoY(v)}H${sx(0)}`).join(""), stroke: GRID });
    for (const v of [50, 100, 150]) el(matchSvg, "text", { x: LEFT - 8, y: tempoY(v) + 4, "text-anchor": "end" }, `${v} BPM`);
    el(matchSvg, "path", { d: `M${sx(-5)},${AXIS_Y}H${sx(0)}`, ...axisStyle });
    for (let s = -5; s <= 0; s++) {
      el(matchSvg, "path", { d: `M${sx(s)},${AXIS_Y}v5`, ...axisStyle });
      el(matchSvg, "text", { x: sx(s), y: AXIS_Y + 18, "text-anchor": "middle" }, tickLabel(s));
    }
    if (now !== null) drawTempo(now);
  }

  // The last 5 s of the estimate (steps), the filled-in estimates (dashed), and the playback
  // BPM printed in the video overlay (yellow).
  function drawTempo(now) {
    const inWindow = t => t > now - 5 - 1e-6 && t <= now + 1e-6;
    const smooth = smoothed.filter(([t, bpm]) => inWindow(t) && bpm !== null).map(([t, bpm]) => [sx(t - now), tempoY(bpm)]);
    el(matchSvg, "path", { d: path(smooth), fill: "none", stroke: VIDEO_YELLOW, "stroke-width": 3.5, "stroke-linejoin": "round" });
    const rowsIn = results.filter(([t]) => inWindow(t));
    let d = "";
    rowsIn.forEach(([t, bpm, , , bars = 1], i) => {
      if (!bpm) return;
      const end = i + 1 < rowsIn.length ? rowsIn[i + 1][0] : now;
      const y = tempoY(bpm * bars).toFixed(1);
      d += `M${sx(t - now).toFixed(1)},${y}H${sx(end - now).toFixed(1)}`;
    });
    el(matchSvg, "path", { d, fill: "none", stroke: "#1d2340", "stroke-width": 2 });
    // Filled-in estimates where the estimator selected no shift, dashed.
    let filled = "";
    rowsIn.forEach(([t, , , , , pseudo], i) => {
      if (!pseudo) return;
      const next = rowsIn.slice(i + 1).find(r => r[1] || r[5]);
      const end = Math.min(next ? next[0] : now, t + 0.8);
      const y = tempoY(pseudo).toFixed(1);
      filled += `M${sx(t - now).toFixed(1)},${y}H${sx(end - now).toFixed(1)}`;
    });
    el(matchSvg, "path", { d: filled, fill: "none", stroke: "#1d2340", "stroke-width": 2, "stroke-dasharray": "3 3" });
    const last = rowsIn.at(-1);
    // Labels at the right end of each line, kept at least 12 px apart.
    let estY = last?.[1] ? tempoY(last[1] * (last[4] ?? 1)) : null;
    let playY = smooth.length ? smooth.at(-1)[1] : null;
    if (estY !== null && playY !== null && Math.abs(estY - playY) < 12) {
      const mid = (estY + playY) / 2;
      [estY, playY] = estY <= playY ? [mid - 6, mid + 6] : [mid + 6, mid - 6];
    }
    if (estY !== null) el(matchSvg, "text", { x: sx(0) + 8, y: estY + 4, fill: "#1d2340" }, "estimate");
    if (playY !== null) el(matchSvg, "text", { x: sx(0) + 8, y: playY + 4 }, "playback");
  }

  let snapshot = null;
  let progress = 1;

  // The shifted copy slides from its own position back to the selected shift. This plays
  // when the figure scrolls into view, when a shift first appears, after seeking, and
  // every 6 s of playback.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const HOLD = 600;
  const SLIDE = 1300;
  const REPEAT_SECONDS = 6;
  let lastSlideTime = -Infinity;
  let animation = 0;
  let wantSlide = false;
  let inView = false;
  // The estimator's selected shift (in samples), or null when it selected none.
  const chosenLag = row => row?.[3] && row[3][2] !== null ? row[3][0] + row[3][2] : null;
  // The highest peak from 1 to 4 s, shown (but not used) when no peak is above the threshold.
  const topPeakLag = row => {
    if (!row?.[3]) return null;
    const [firstLag, scores] = row[3];
    const at = k => scores[k - firstLag];
    let best = null;
    for (let k = MIN_LAG; k <= MAX_LAG; k++) {
      const peak = at(k) >= at(k - 1) && at(k) > at(k + 1);
      if (peak && (best === null || at(k) > at(best))) best = k;
    }
    return best;
  };

  function slide() {
    wantSlide = false;
    lastSlideTime = video.currentTime;
    if (reducedMotion.matches) return;
    cancelAnimationFrame(animation);
    let start = null;
    const step = now => {
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start - HOLD) / SLIDE));
      progress = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      render();
      if (t < 1) animation = requestAnimationFrame(step);
    };
    progress = 0;
    animation = requestAnimationFrame(step);
  }

  function requestSlide() {
    if (inView && chosenLag(snapshot) !== null) slide();
    else wantSlide = true;
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView && wantSlide) requestSlide();
  }, { threshold: 0.5 }).observe(matchSvg);
  wantSlide = true;
  video.addEventListener("seeked", requestSlide);

  function snapshotAt(time) {
    let lo = -1;
    let hi = results.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (results[mid][0] <= time + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    return lo < 0 ? null : results[lo];
  }

  function render() {
    const [, bpm, signal, correlation, bars = 1] = snapshot ?? [0, null, null, null];
    const lag = chosenLag(snapshot);
    // Partway back while sliding.
    const shift = lag ? progress * lag / RATE : 0;
    drawMotion(signal, correlation, lag, lag !== null, shift);
    drawMatch(snapshot ? snapshot[0] : null);

    // A selected shift that spans two bars doubles the tempo. With no shift selected, the BPM
    // shows the latest filled-in estimate in grey, or the top peak's tempo before there is one.
    if (lag !== null && bpm) bpmOutput.value = Math.round(bpm * bars);
    else {
      const i = results.indexOf(snapshot);
      let filled = null;
      for (let j = i; j >= 0 && !results[j][1]; j--) if (results[j][5]) { filled = results[j][5]; break; }
      const top = topPeakLag(snapshot);
      bpmOutput.value = filled ? Math.round(filled) : top !== null ? Math.round(240 * RATE / top) : "–";
    }
    bpmLine.classList.toggle("preview", !(lag !== null && bpm));
  }

  function sync(time) {
    const next = snapshotAt(time);
    if (next === snapshot) return;
    const appeared = chosenLag(snapshot) === null && chosenLag(next) !== null;
    snapshot = next;
    const due = !video.paused && Math.abs(time - lastSlideTime) >= REPEAT_SECONDS;
    if (appeared || due || (wantSlide && chosenLag(next) !== null)) requestSlide();
    render();
  }

  rotation.addEventListener("input", render);

  for (const event of ["loadedmetadata", "seeking", "seeked", "timeupdate"]) {
    video.addEventListener(event, () => sync(video.currentTime));
  }
  if (video.requestVideoFrameCallback) {
    const frame = (_, { mediaTime }) => {
      sync(mediaTime);
      video.requestVideoFrameCallback(frame);
    };
    video.requestVideoFrameCallback(frame);
  }
  render();
})();
