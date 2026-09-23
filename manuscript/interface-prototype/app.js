const $ = (id) => document.getElementById(id);

const canvas = $("poseCanvas");
const ctx = canvas.getContext("2d");
const video = $("cameraFeed");
const colors = {
  blue: "#2f6fb2",
  teal: "#2aa6a1",
  green: "#3f915c",
  orange: "#d88722",
  red: "#c95443",
  purple: "#6d5aa7",
  slate: "#52606d",
};

const dimensions = [
  ["Posture", colors.teal],
  ["Rhythm", colors.green],
  ["Amplitude", colors.orange],
  ["Coordination", colors.purple],
  ["Balance", colors.orange],
  ["Style", colors.blue],
];

const feedbackBank = {
  timing: ["Peak transition was slightly delayed.", "Timing stayed aligned with the current phrase.", "Preparation began early enough for the next movement."],
  amplitude: ["Arm extension can be larger in the lateral reach.", "Movement range is stable across the phrase.", "Landing compression is controlled."],
  balance: ["Center of mass drifted during the turn.", "Lower-body support is steady.", "Landing recovery is clean."],
  coordination: ["Upper and lower limbs are synchronized.", "Wrist trajectory leads the phrase clearly.", "Knee and ankle timing should be tightened."],
};

let running = false;
let startTime = 0;
let frame = 0;
let raf = 0;
let cameraStream = null;
let lastFpsTick = performance.now();
let fpsFrames = 0;
let current = {
  overall: 0,
  level: "--",
  dimensions: Object.fromEntries(dimensions.map(([name]) => [name, 0])),
  cues: [],
};

function init() {
  renderSubscores();
  renderTimeline();
  renderFeedback();
  log("Terminal initialized. Demo mode is ready.");
  $("startBtn").addEventListener("click", toggleRun);
  $("resetBtn").addEventListener("click", reset);
  $("exportBtn").addEventListener("click", exportReport);
  $("sourceSelect").addEventListener("change", handleSource);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  draw(0);
  if (new URLSearchParams(window.location.search).get("run") === "1") {
    setTimeout(() => {
      if (!running) toggleRun();
    }, 150);
  }
}

function resizeCanvas() {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(640, Math.floor(box.width * ratio));
  canvas.height = Math.max(360, Math.floor(box.height * ratio));
}

async function handleSource() {
  stopCamera();
  const source = $("sourceSelect").value;
  video.style.display = "none";
  $("demoBackdrop").style.display = "block";
  if (source !== "camera") return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    video.srcObject = cameraStream;
    await video.play();
    video.style.display = "block";
    $("demoBackdrop").style.display = "none";
    log("Camera source connected.");
  } catch {
    $("sourceSelect").value = "demo";
    log("Camera unavailable. Returned to demo source.");
  }
}

function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

function toggleRun() {
  running = !running;
  $("startBtn").textContent = running ? "Pause" : "Start";
  $("runState").textContent = running ? "Running" : "Paused";
  if (running) {
    startTime = startTime || performance.now();
    loop(performance.now());
    log(`Started ${$("styleSelect").value} scoring session.`);
  } else {
    cancelAnimationFrame(raf);
    log("Session paused.");
  }
}

function reset() {
  running = false;
  cancelAnimationFrame(raf);
  startTime = 0;
  frame = 0;
  current.overall = 0;
  current.level = "--";
  current.dimensions = Object.fromEntries(dimensions.map(([name]) => [name, 0]));
  current.cues = [];
  $("startBtn").textContent = "Start";
  $("runState").textContent = "Idle";
  $("overallScore").textContent = "--";
  $("qualityLevel").textContent = "--";
  $("timeText").textContent = "00:00";
  $("frameText").textContent = "Frame 0";
  renderSubscores();
  renderFeedback();
  renderTimeline();
  draw(0);
  log("Session reset.");
}

function loop(now) {
  if (!running) return;
  frame += 1;
  const t = (now - startTime) / 1000;
  current = scoreFrame(t, frame);
  $("overallScore").textContent = current.overall.toFixed(1);
  $("qualityLevel").textContent = current.level;
  $("timeText").textContent = formatTime(t);
  $("frameText").textContent = `Frame ${frame}`;
  $("sessionMeta").textContent = `${$("styleSelect").value} · ${$("sourceSelect").value} source · scaffold scoring`;
  updateFps(now);
  renderSubscores();
  renderFeedback();
  renderTimeline(t);
  draw(t);
  raf = requestAnimationFrame(loop);
}

function scoreFrame(t, frameNo) {
  const base = 78 + Math.sin(t * 0.9) * 5 + Math.sin(t * 2.7) * 2.5;
  const dims = {};
  dimensions.forEach(([name], index) => {
    const value = base + Math.sin(t * (0.8 + index * 0.16) + index) * 7 - index * 0.55;
    dims[name] = clamp(value, 45, 96);
  });
  const overall = Object.values(dims).reduce((a, b) => a + b, 0) / dimensions.length;
  const level = overall >= 88 ? "Excellent" : overall >= 78 ? "Good" : overall >= 68 ? "Developing" : "Needs review";
  const cues = pickCues(t, dims, frameNo);
  return { overall, level, dimensions: dims, cues };
}

function pickCues(t, dims, frameNo) {
  const keys = Object.keys(feedbackBank);
  return keys.map((key, index) => {
    const list = feedbackBank[key];
    const item = list[Math.abs(Math.floor(t + frameNo / 90 + index)) % list.length];
    const score = dims[dimensions[index + 1]?.[0] || "Posture"];
    return { key, item, color: dimensions[index + 1]?.[1] || colors.teal, score };
  });
}

function renderSubscores() {
  $("subscores").innerHTML = dimensions.map(([name, color]) => {
    const value = current.dimensions[name] || 0;
    const width = value ? `${value}%` : "0%";
    const label = value ? value.toFixed(0) : "--";
    return `
      <div class="metricRow">
        <span>${name}</span>
        <span class="barTrack"><span class="barFill" style="width:${width};background:${color}"></span></span>
        <strong>${label}</strong>
      </div>
    `;
  }).join("");
}

function renderFeedback() {
  const cues = current.cues.length ? current.cues : pickCues(0, current.dimensions, 0);
  $("feedbackList").innerHTML = cues.map((cue) => `
    <div class="feedbackItem">
      <span class="dot" style="background:${cue.color}">${cue.key[0].toUpperCase()}</span>
      <span><strong>${titleCase(cue.key)}</strong><span>${cue.item}</span></span>
    </div>
  `).join("");
  $("cueList").innerHTML = cues.map((cue) => `
    <div class="cueItem">
      <span class="dot" style="background:${cue.color}">${Math.round(cue.score || 0)}</span>
      <span><strong>${titleCase(cue.key)} evidence</strong><span>Displayed as supportive feedback, not causal proof.</span></span>
    </div>
  `).join("");
}

function renderTimeline(t = 0) {
  const phase = Math.floor(t % 9 / 3);
  const items = [
    ["Preparation", "Frame window 1-32", colors.blue],
    ["Peak / transition", "Frame window 33-64", colors.orange],
    ["Landing", "Frame window 65-96", colors.green],
  ];
  $("timeline").innerHTML = items.map(([name, text, color], index) => `
    <div class="keyframe" style="border-color:${index === phase && running ? color : "var(--line)"}">
      <span class="keyIcon" style="background:${color}"></span>
      <span><strong>${name}</strong><span>${text}</span></span>
    </div>
  `).join("");
}

function draw(t) {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.48 + Math.sin(t * 1.1) * w * 0.08;
  const cy = h * 0.5 + Math.sin(t * 1.7) * h * 0.04;
  const scale = Math.min(w, h) / 560;
  const pose = makePose(cx, cy, scale, t);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawGlow(pose, scale);
  drawBones(pose, scale);
  drawJoints(pose, scale, t);
}

function makePose(cx, cy, s, t) {
  const arm = Math.sin(t * 2.2);
  const leg = Math.sin(t * 1.4 + 1);
  return {
    head: [cx, cy - 145 * s],
    neck: [cx, cy - 95 * s],
    lShoulder: [cx - 70 * s, cy - 80 * s],
    rShoulder: [cx + 70 * s, cy - 80 * s],
    lElbow: [cx - (125 + arm * 30) * s, cy - (42 + arm * 18) * s],
    rElbow: [cx + (130 - arm * 24) * s, cy - (38 - arm * 24) * s],
    lWrist: [cx - (175 + arm * 35) * s, cy + (2 - arm * 44) * s],
    rWrist: [cx + (190 - arm * 20) * s, cy - (4 + arm * 58) * s],
    pelvis: [cx, cy + 30 * s],
    lHip: [cx - 45 * s, cy + 35 * s],
    rHip: [cx + 45 * s, cy + 35 * s],
    lKnee: [cx - (80 + leg * 28) * s, cy + 130 * s],
    rKnee: [cx + (85 - leg * 20) * s, cy + 122 * s],
    lAnkle: [cx - (112 + leg * 28) * s, cy + 230 * s],
    rAnkle: [cx + (120 - leg * 16) * s, cy + 220 * s],
  };
}

function drawBones(p, s) {
  const bones = [
    ["head", "neck"], ["neck", "lShoulder"], ["neck", "rShoulder"], ["lShoulder", "lElbow"], ["lElbow", "lWrist"],
    ["rShoulder", "rElbow"], ["rElbow", "rWrist"], ["neck", "pelvis"], ["pelvis", "lHip"], ["pelvis", "rHip"],
    ["lHip", "lKnee"], ["lKnee", "lAnkle"], ["rHip", "rKnee"], ["rKnee", "rAnkle"],
  ];
  ctx.strokeStyle = "rgba(82,96,109,0.86)";
  ctx.lineWidth = 7 * s;
  bones.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(...p[a]);
    ctx.lineTo(...p[b]);
    ctx.stroke();
  });
}

function drawJoints(p, s, t) {
  Object.entries(p).forEach(([key, [x, y]]) => {
    const high = key.includes("Ankle") || key.includes("Knee");
    ctx.fillStyle = high ? (Math.sin(t * 2) > 0 ? colors.orange : colors.red) : colors.teal;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(x, y, (high ? 11 : 9) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawGlow(p, s) {
  ctx.strokeStyle = "rgba(42,166,161,0.18)";
  ctx.lineWidth = 28 * s;
  ctx.beginPath();
  ctx.moveTo(...p.lWrist);
  ctx.quadraticCurveTo(...p.neck, ...p.rWrist);
  ctx.stroke();
}

function updateFps(now) {
  fpsFrames += 1;
  if (now - lastFpsTick < 700) return;
  const fps = Math.round((fpsFrames * 1000) / (now - lastFpsTick));
  $("fpsText").textContent = `${fps} fps`;
  fpsFrames = 0;
  lastFpsTick = now;
}

function exportReport() {
  const report = {
    app: "Dance Scoring Terminal",
    note: "Demo scaffold. Replace scoreFrame() with a validated model adapter before using for empirical claims.",
    style: $("styleSelect").value,
    source: $("sourceSelect").value,
    frame,
    timestamp: new Date().toISOString(),
    result: current,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dance-scoring-report-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  log("Exported JSON session report.");
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
  $("sessionLog").prepend(item);
  while ($("sessionLog").children.length > 8) $("sessionLog").lastChild.remove();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function titleCase(text) {
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

init();

