import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise, ArrowRight, Camera, CaretDown, ChartLineUp, Check, CheckCircle,
  Clock, DownloadSimple, FileVideo, Gauge, Info, Pause, PencilSimple, Play, Printer,
  ShieldCheck, Sparkle, Stop, Target, Trash, UploadSimple, UserFocus, VideoCamera, X,
} from "@phosphor-icons/react";
import studioBackground from "./assets/studio-background.png";
import { PoseCanvas } from "./components/PoseCanvas";
import { scorePoseWindow } from "./domain/scoring";
import {
  Assessment, DEFAULT_DIMENSIONS, DIMENSIONS, FeedbackCue, InputSource, KeyMoment, Landmark, PoseFrame,
  SessionConfig, SessionRecord, SessionStatus,
} from "./domain/types";
import { detectionCoverage, shouldProcessVideoFrame, videoTimestampMs } from "./domain/videoTiming";
import { detectPose, loadPoseEngine, poseRuntimeMeta } from "./services/poseEngine";
import { clearSessions, deleteSession, exportSession, loadSessions, saveSession } from "./services/persistence";

const ROUTINES: Record<SessionConfig["style"], string[]> = {
  Contemporary: ["Arc and release", "Floor-to-flight phrase", "Off-axis study"],
  Folk: ["Rhythmic step sequence", "Circular arm phrase", "Traveling pattern"],
  Street: ["Groove foundation", "Hit and rebound", "Footwork combination"],
  Classical: ["Adagio line study", "Center tendu phrase", "Balance and turn"],
};

const DIMENSION_META = {
  Posture: { color: "#3185c6", short: "Body alignment" },
  Rhythm: { color: "#15a8a1", short: "Timing consistency" },
  Amplitude: { color: "#f28c35", short: "Range and extension" },
  Coordination: { color: "#7566b7", short: "Limb sequencing" },
  Balance: { color: "#e4ad24", short: "Support stability" },
  Style: { color: "#3478b9", short: "Style conformity" },
} as const;

const defaultConfig: SessionConfig = {
  dancerName: "",
  style: "Contemporary",
  routine: ROUTINES.Contemporary[0],
  level: "Intermediate",
  source: "demo",
  durationSeconds: 9,
};

const DEMO_VIDEO_URL = `${import.meta.env.BASE_URL}samples/real-dance-sample.mp4`;

type View = "studio" | "review" | "progress";
type RuntimeState = "idle" | "loading" | "ready" | "degraded" | "denied";

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatDate = (iso: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const makeSessionId = () => `MS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-4)}`;

function MetricBar({ name, value, compact = false }: { name: keyof typeof DIMENSION_META; value: number; compact?: boolean }) {
  const meta = DIMENSION_META[name];
  return (
    <div className={`metric-row ${compact ? "compact-metric" : ""}`}>
      <span className="metric-name"><i style={{ background: meta.color }} />{name}</span>
      <span className="metric-track" aria-label={`${name} ${Math.round(value)} out of 100`}>
        <span className="metric-fill" style={{ width: `${Math.max(2, value)}%`, background: meta.color }} />
      </span>
      <strong>{value ? Math.round(value) : "--"}</strong>
    </div>
  );
}

function QualityStars({ score }: { score: number }) {
  const count = Math.max(0, Math.min(5, Math.round(score / 20)));
  return <div className="quality-stars" aria-label={`${count} of 5 quality markers`}>{[0, 1, 2, 3, 4].map((item) => <Sparkle key={item} weight={item < count ? "fill" : "regular"} />)}</div>;
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const label = { setup: "Setup", ready: "Ready", running: "Live", paused: "Paused", complete: "Complete" }[status];
  return <span className={`status-badge status-${status}`}><i />{label}</span>;
}

function Readiness({ runtime, pose, poseCount }: { runtime: RuntimeState; pose: Landmark[] | null; poseCount: number }) {
  const checks = [
    [runtime === "ready", "Local pose runtime"],
    [Boolean(pose), "Full-body pose"],
    [Boolean(pose && pose.filter((p) => p.visibility > .55).length > 25), "Landmark coverage"],
    [poseCount <= 1, poseCount > 1 ? `${poseCount} people in frame` : "Single subject"],
  ] as const;
  return <div className="readiness">{checks.map(([ready, label]) => <span key={label} className={ready ? "ready" : "waiting"}>{ready ? <CheckCircle weight="fill" /> : <Clock />} {label}</span>)}</div>;
}

function EmptyTimeline() {
  return <div className="timeline-empty"><Target /><span>Key phases appear as the assessment develops.</span></div>;
}

function waitForVideoMetadata(video: HTMLVideoElement, source?: string) {
  return new Promise<void>((resolve, reject) => {
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("The browser could not decode this video.")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("error", failed);
    };
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("error", failed);
    if (source) {
      const absolute = new URL(source, document.baseURI).href;
      if (video.src !== absolute) { video.src = source; video.load(); }
    }
    if (video.readyState >= 1 && Number.isFinite(video.duration)) ready();
  });
}

export function App() {
  const [view, setView] = useState<View>("studio");
  const [status, setStatus] = useState<SessionStatus>("setup");
  const [config, setConfig] = useState<SessionConfig>(defaultConfig);
  const [assessment, setAssessment] = useState<Assessment>({
    overall: 0, quality: "Needs focus", dimensions: { ...DEFAULT_DIMENSIONS }, confidence: 0,
    jointContributions: {}, temporalSalience: [], cues: [], latencyMs: 0, inferenceMode: "demo-pose",
  });
  const [pose, setPose] = useState<Landmark[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [fps, setFps] = useState(0);
  const [processedFrameCount, setProcessedFrameCount] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeState>("idle");
  const [runtimeMessage, setRuntimeMessage] = useState("Local preview ready");
  const [keyMoments, setKeyMoments] = useState<KeyMoment[]>([]);
  const [history, setHistory] = useState<SessionRecord[]>(() => loadSessions());
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [note, setNote] = useState("");
  const [approved, setApproved] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showSetup, setShowSetup] = useState(true);
  const [uploadName, setUploadName] = useState("");
  const [mediaDuration, setMediaDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [poseCount, setPoseCount] = useState(0);
  const [detectionStats, setDetectionStats] = useState({ sampled: 0, detected: 0, missed: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadUrlRef = useRef<string | null>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const startAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const processingRef = useRef(false);
  const countedFramesRef = useRef(0);
  const fpsAtRef = useRef(0);
  const totalDetectedRef = useRef(0);
  const sampledFramesRef = useRef(0);
  const missedFramesRef = useRef(0);
  const missedStreakRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const selectedRecord = record ?? history[0] ?? null;
  const comparison = history.filter((item) => compareIds.includes(item.id));
  const progressAverage = history.length ? history.reduce((sum, item) => sum + item.assessment.overall, 0) / history.length : 0;
  const latestDelta = history.length > 1 ? history[0].assessment.overall - history[1].assessment.overall : 0;
  const targetDuration = mediaDuration || config.durationSeconds;
  const coverage = detectionCoverage(detectionStats.detected, detectionStats.sampled);

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; video.removeAttribute("src"); }
  }, []);

  const captureVideoMetadata = useCallback((video: HTMLVideoElement) => {
    setVideoSize(video.videoWidth && video.videoHeight ? { width: video.videoWidth, height: video.videoHeight } : null);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setMediaDuration(video.duration);
      setConfig((current) => ({ ...current, durationSeconds: video.duration }));
    }
  }, []);

  useEffect(() => () => stopMedia(), [stopMedia]);

  const prepareSource = useCallback(async () => {
    if (config.source === "demo") {
      stopMedia();
      const video = videoRef.current;
      if (!video) return false;
      setRuntime("loading"); setRuntimeMessage("Loading bundled dancer and pose model");
      try {
        await waitForVideoMetadata(video, DEMO_VIDEO_URL);
        captureVideoMetadata(video);
        await loadPoseEngine();
        setRuntime("ready"); setRuntimeMessage("Verified dancer sample and local 33-point pose ready");
        setStatus("ready"); return true;
      } catch {
        setRuntime("degraded"); setRuntimeMessage("Bundled pose runtime could not start."); return false;
      }
    }
    if (config.source === "upload") {
      if (!uploadUrlRef.current) { setRuntime("degraded"); setRuntimeMessage("Choose a video file to continue"); return false; }
      const video = videoRef.current;
      if (!video) return false;
      setRuntime("loading"); setRuntimeMessage("Validating video decoder and local pose runtime");
      try {
        await waitForVideoMetadata(video);
        captureVideoMetadata(video);
        await loadPoseEngine();
        setRuntime("ready"); setRuntimeMessage(`Video ready, ${video.videoWidth}×${video.videoHeight}, ${formatTime(video.duration)}`); setStatus("ready"); return true;
      } catch {
        setRuntime("degraded"); setRuntimeMessage("This file could not be decoded or analyzed. Try MP4 or WebM."); return false;
      }
    }
    stopMedia();
    setRuntime("loading"); setRuntimeMessage("Requesting camera permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream; await videoRef.current.play();
        setVideoSize(videoRef.current.videoWidth && videoRef.current.videoHeight ? { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight } : null);
      }
      setRuntimeMessage("Loading local pose runtime");
      await loadPoseEngine();
      setRuntime("ready"); setRuntimeMessage("Camera and on-device pose runtime ready"); setStatus("ready"); return true;
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setRuntime(denied ? "denied" : "degraded");
      setRuntimeMessage(denied ? "Camera access denied. Use the real-video Demo or Upload." : "Camera or pose runtime unavailable.");
      return false;
    }
  }, [captureVideoMetadata, config.source, stopMedia]);

  const startSession = useCallback(async () => {
    if (status === "paused") {
      startAtRef.current += performance.now() - pausedAtRef.current;
      if (config.source !== "camera") await videoRef.current?.play();
      setStatus("running"); return;
    }
    if (status === "setup" || status === "complete") {
      const ready = await prepareSource();
      if (!ready) return;
    }
    framesRef.current = [];
    setKeyMoments([]); setAssessment((current) => ({ ...current, overall: 0, dimensions: { ...DEFAULT_DIMENSIONS }, cues: [] }));
    setElapsed(0); setProcessedFrameCount(0); setPose(null); setPoseCount(0); setDetectionStats({ sampled: 0, detected: 0, missed: 0 });
    startAtRef.current = performance.now(); fpsAtRef.current = performance.now(); countedFramesRef.current = 0; totalDetectedRef.current = 0;
    sampledFramesRef.current = 0; missedFramesRef.current = 0; missedStreakRef.current = 0; lastVideoTimeRef.current = -1;
    if (config.source !== "camera" && videoRef.current) { videoRef.current.currentTime = 0; await videoRef.current.play(); }
    setShowSetup(false); setStatus("running");
  }, [config.source, prepareSource, status]);

  const pauseSession = () => {
    pausedAtRef.current = performance.now();
    if (config.source !== "camera") videoRef.current?.pause();
    setStatus("paused");
  };

  const createMoment = useCallback((label: KeyMoment["label"], seconds: number, landmarks: Landmark[], score: number) => ({
    id: `${label}-${Math.round(seconds * 10)}`, timestamp: seconds, label, score, landmarks: structuredClone(landmarks),
  }), []);

  const finishSession = useCallback(() => {
    const latestFrame = framesRef.current.at(-1);
    if (!latestFrame || framesRef.current.length < 6) {
      videoRef.current?.pause();
      setStatus("ready"); setRuntime("degraded"); setShowSetup(true);
      setRuntimeMessage("No stable full-body pose was found. Use a single visible dancer with the full body in frame.");
      return;
    }
    const finalAssessment = scorePoseWindow(framesRef.current, config.style, config.source === "demo" ? "demo-pose" : "pose-kinematics");
    const now = new Date().toISOString();
    let moments = keyMoments;
    if (!moments.length) moments = [createMoment("Peak / transition", elapsed, latestFrame.landmarks, finalAssessment.overall)];
    const next: SessionRecord = {
      schemaVersion: 1, id: makeSessionId(), createdAt: new Date(Date.now() - elapsed * 1000).toISOString(), completedAt: now,
      config: { ...config, durationSeconds: targetDuration }, duration: elapsed, frameCount: totalDetectedRef.current, assessment: finalAssessment, keyMoments: moments,
      instructorNote: note, approved, editedFeedback: finalAssessment.cues,
    };
    setAssessment(finalAssessment); setRecord(next); setHistory(saveSession(next)); setStatus("complete"); setView("review"); stopMedia();
  }, [approved, config, createMoment, elapsed, keyMoments, note, stopMedia, targetDuration]);

  const resetSession = () => {
    stopMedia(); framesRef.current = []; setPose(null); setElapsed(0); setFps(0); setProcessedFrameCount(0); setKeyMoments([]);
    setMediaDuration(0); setVideoSize(null); setPoseCount(0); setDetectionStats({ sampled: 0, detected: 0, missed: 0 });
    totalDetectedRef.current = 0; sampledFramesRef.current = 0; missedFramesRef.current = 0; missedStreakRef.current = 0; lastVideoTimeRef.current = -1;
    setAssessment({ overall: 0, quality: "Needs focus", dimensions: { ...DEFAULT_DIMENSIONS }, confidence: 0, jointContributions: {}, temporalSalience: [], cues: [], latencyMs: 0, inferenceMode: config.source === "demo" ? "demo-pose" : "pose-kinematics" });
    setStatus("setup"); setRuntime("idle"); setRuntimeMessage("Local preview ready"); setShowSetup(true); setView("studio"); setRecord(null); setNote(""); setApproved(false);
  };

  useEffect(() => {
    if (status !== "running") return;
    let raf = 0; let cancelled = false;
    const tick = async (now: number) => {
      if (cancelled) return;
      const video = videoRef.current;
      const usesMediaClock = config.source !== "camera";
      const seconds = usesMediaClock ? (video?.currentTime ?? 0) : (now - startAtRef.current) / 1000;
      setElapsed(seconds);
      let nextFrame: PoseFrame | null = null;
      let sampled = false;
      const canSampleMedia = !usesMediaClock || shouldProcessVideoFrame(lastVideoTimeRef.current, seconds);
      if (!processingRef.current && video && canSampleMedia) {
        processingRef.current = true;
        sampled = true;
        if (usesMediaClock) lastVideoTimeRef.current = seconds;
        try { nextFrame = await detectPose(video, usesMediaClock ? videoTimestampMs(seconds) : now); }
        catch { setRuntime("degraded"); setRuntimeMessage("Pose inference paused. Retry the source."); }
        processingRef.current = false;
      }
      if (sampled) {
        sampledFramesRef.current += 1;
        if (nextFrame) {
          totalDetectedRef.current += 1; missedStreakRef.current = 0;
        } else {
          missedFramesRef.current += 1; missedStreakRef.current += 1;
          if (missedStreakRef.current >= 12) {
            setPose(null); setPoseCount(0);
            setRuntimeMessage("Searching for a full-body pose. Keep head, hands, hips, knees, and feet visible.");
          }
        }
        if (sampledFramesRef.current % 3 === 0 || !nextFrame) {
          setDetectionStats({ sampled: sampledFramesRef.current, detected: totalDetectedRef.current, missed: missedFramesRef.current });
        }
      }
      if (nextFrame) {
        framesRef.current = [...framesRef.current.slice(-95), nextFrame];
        setProcessedFrameCount((count) => count + 1);
        setPose(nextFrame.landmarks);
        setPoseCount(nextFrame.poseCount ?? 1);
        countedFramesRef.current += 1;
        if (nextFrame.poseCount && nextFrame.poseCount > 1) setRuntimeMessage(`${nextFrame.poseCount} people detected. Scoring the highest-visibility subject.`);
        else if (missedStreakRef.current === 0 && sampledFramesRef.current % 15 === 0) setRuntimeMessage("Full-body pose locked. Frames stay on this device.");
        if (framesRef.current.length > 5 && totalDetectedRef.current % 3 === 0) {
          setAssessment(scorePoseWindow(framesRef.current, config.style, config.source === "demo" ? "demo-pose" : "pose-kinematics"));
        }
        const ratio = seconds / Math.max(1, targetDuration);
        const wanted: [number, KeyMoment["label"]][] = [[.2, "Preparation"], [.52, "Peak / transition"], [.82, "Landing"]];
        wanted.forEach(([at, label]) => {
          if (ratio >= at) setKeyMoments((current) => current.some((item) => item.label === label) ? current : [...current, createMoment(label, seconds, nextFrame!.landmarks, assessment.overall)]);
        });
      }
      if (now - fpsAtRef.current > 700) {
        setFps(Math.round(countedFramesRef.current * 1000 / (now - fpsAtRef.current)));
        countedFramesRef.current = 0; fpsAtRef.current = now;
      }
      if (usesMediaClock && video?.ended) { finishSession(); return; }
      if (!usesMediaClock && seconds >= targetDuration) { finishSession(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [assessment.overall, config.source, config.style, createMoment, finishSession, status, targetDuration]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("run") === "1" && status === "setup") {
      const timer = setTimeout(() => void startSession(), 200);
      return () => clearTimeout(timer);
    }
  }, [startSession, status]);

  const updateConfig = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => {
    setConfig((current) => {
      const next = { ...current, [key]: value };
      if (key === "style") next.routine = ROUTINES[value as SessionConfig["style"]][0];
      return next;
    });
  };

  const selectSource = (source: InputSource) => {
    stopMedia();
    setMediaDuration(0); setVideoSize(null); setPose(null); setPoseCount(0); setDetectionStats({ sampled: 0, detected: 0, missed: 0 });
    setRuntime("idle"); setRuntimeMessage(source === "demo" ? "Bundled real-video sample ready for setup" : "Run setup check when the source is ready");
    setConfig((current) => ({ ...current, source, durationSeconds: source === "camera" ? 45 : source === "demo" ? 9 : current.durationSeconds }));
    if (source !== "upload") setUploadName("");
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !videoRef.current) return;
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = URL.createObjectURL(file); setUploadName(file.name); setMediaDuration(0); setPose(null); setPoseCount(0);
    videoRef.current.srcObject = null; videoRef.current.src = uploadUrlRef.current; videoRef.current.load();
    setRuntime("idle"); setRuntimeMessage(`${file.name} selected, ${(file.size / 1024 / 1024).toFixed(1)} MB. Run setup check.`);
  };

  const updateCue = (id: string, patch: Partial<FeedbackCue>) => {
    setAssessment((current) => ({ ...current, cues: current.cues.map((cue) => cue.id === id ? { ...cue, ...patch } : cue) }));
    if (record) setRecord({ ...record, editedFeedback: record.editedFeedback.map((cue) => cue.id === id ? { ...cue, ...patch } : cue) });
  };

  const approveRecord = () => {
    if (!record) return;
    const updated = { ...record, approved: !approved, instructorNote: note, editedFeedback: record.editedFeedback.length ? record.editedFeedback : assessment.cues };
    setApproved(updated.approved); setRecord(updated); setHistory(saveSession(updated));
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => setView("studio")} aria-label="Open Dance Scoring Terminal">
          <span className="brand-mark"><UserFocus weight="duotone" /></span>
          <span><strong>Dance Scoring Terminal</strong><small>Motion intelligence platform</small></span>
        </button>
        <nav aria-label="Primary navigation">
          <button className={view === "studio" ? "active" : ""} onClick={() => setView("studio")}><VideoCamera /> Studio</button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")} disabled={!selectedRecord}><Target /> Review</button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><ChartLineUp /> Progress <span className="count">{history.length}</span></button>
        </nav>
        <div className="privacy"><ShieldCheck weight="fill" /><span>Local processing<small>Frames remain on device</small></span></div>
      </header>

      {view === "studio" && <main className="page studio-page">
        <section className="session-strip">
          <div><span>Session</span><strong>{status === "setup" ? "New assessment" : makeSessionId().slice(0, -4) + "LIVE"}</strong></div>
          <div><span>Dancer</span><strong>{config.dancerName || "Guest dancer"}</strong></div>
          <div><span>Routine</span><strong>{config.routine}</strong></div>
          <div><span>Target</span><strong>{formatTime(targetDuration)} · media clock</strong></div>
          <StatusBadge status={status} />
          <div className="session-actions">
            {status === "running" ? <button className="button secondary" onClick={pauseSession}><Pause weight="fill" /> Pause</button> : <button className="button primary" onClick={() => void startSession()} disabled={runtime === "loading"}><Play weight="fill" /> {status === "paused" ? "Resume" : "Start"}</button>}
            {(status === "running" || status === "paused") && <button className="button dark" onClick={finishSession} disabled={!assessment.overall}><Stop weight="fill" /> Finish</button>}
            <button className="icon-button" onClick={resetSession} aria-label="Reset session" title="Reset session"><ArrowCounterClockwise /></button>
          </div>
        </section>

        <section className="studio-grid">
          <div className="main-column">
            <article className="stage-card">
              <div className="card-heading">
                <div><strong>Live movement view</strong><span>{config.style} · {config.routine}</span></div>
                <div className="stage-meta"><span><Gauge /> {fps || "--"} fps</span><span><Clock /> {assessment.latencyMs ? assessment.latencyMs.toFixed(1) : "--"} ms</span><button className="text-button" onClick={() => setShowSetup(!showSetup)}>Session setup <CaretDown /></button></div>
              </div>
              <div className={`stage-view source-${config.source}`}>
                <img src={studioBackground} alt="Empty professional dance studio" />
                <video ref={videoRef} playsInline muted className={runtime !== "idle" || Boolean(uploadName) ? "visible" : ""} onLoadedMetadata={(event) => captureVideoMetadata(event.currentTarget)} />
                <PoseCanvas landmarks={pose} mirrored={config.source === "camera"} sourceSize={videoSize} />
                <div className="stage-gradient" />
                <div className="stage-clock"><span>{formatTime(elapsed)}</span><small>/ {formatTime(targetDuration)}</small></div>
                <div className="inference-chip"><i className={runtime === "degraded" || runtime === "denied" ? "warn" : ""} />{config.source === "demo" ? "Real sample · live 33-point pose" : "Live pose · kinematics"}</div>
                {detectionStats.sampled > 0 && <div className="detection-chip"><strong>{coverage}%</strong><span>pose coverage</span><small>{detectionStats.detected}/{detectionStats.sampled} sampled</small></div>}
                {status === "setup" && !showSetup && <button className="stage-empty" onClick={() => setShowSetup(true)}><Camera size={32} /><strong>Configure an assessment</strong><span>Choose a source and routine to begin.</span></button>}
              </div>
              <div className="stage-footer">
                <Readiness runtime={runtime} pose={pose} poseCount={poseCount} />
                <span className="runtime-message"><Info /> {runtimeMessage}</span>
              </div>
              {showSetup && status !== "running" && <div className="setup-drawer">
                <div className="setup-heading"><div><span className="eyebrow">Session setup</span><h2>Prepare the movement capture</h2><p>Video stays on this device. The Demo runs a licensed real dancer through the same local pose engine used for uploads.</p></div><button className="icon-button" onClick={() => setShowSetup(false)} aria-label="Close setup"><X /></button></div>
                <div className="setup-grid">
                  <label><span>Dancer name <small>optional</small></span><input value={config.dancerName} onChange={(e) => updateConfig("dancerName", e.target.value)} placeholder="Guest dancer" /></label>
                  <label><span>Dance style</span><select value={config.style} onChange={(e) => updateConfig("style", e.target.value as SessionConfig["style"])}>{Object.keys(ROUTINES).map((style) => <option key={style}>{style}</option>)}</select></label>
                  <label><span>Routine</span><select value={config.routine} onChange={(e) => updateConfig("routine", e.target.value)}>{ROUTINES[config.style].map((routine) => <option key={routine}>{routine}</option>)}</select></label>
                  <label><span>Experience level</span><select value={config.level} onChange={(e) => updateConfig("level", e.target.value as SessionConfig["level"])}><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></label>
                </div>
                <fieldset className="source-picker"><legend>Movement source</legend>
                  {(["demo", "camera", "upload"] as InputSource[]).map((source) => {
                    const Icon = source === "demo" ? Play : source === "camera" ? Camera : FileVideo;
                    return <label key={source} className={config.source === source ? "selected" : ""}><input type="radio" name="source" value={source} checked={config.source === source} onChange={() => selectSource(source)} /><Icon /><span><strong>{source === "demo" ? "Real-video demo" : source === "camera" ? "Live camera" : "Video file"}</strong><small>{source === "demo" ? "9-second single-dancer benchmark" : source === "camera" ? "Real-time capture" : "MP4, MOV, or WebM on device"}</small></span><i /></label>;
                  })}
                </fieldset>
                {config.source === "upload" && <label className="upload-box"><UploadSimple /><span><strong>{uploadName || "Choose a dance video"}</strong><small>{mediaDuration ? `${videoSize?.width ?? "?"}×${videoSize?.height ?? "?"} · ${formatTime(mediaDuration)} · processed locally` : "MP4, MOV, or WebM. Processed locally."}</small></span><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleUpload} /></label>}
                <div className="setup-actions"><button className="button secondary" onClick={() => void prepareSource()} disabled={runtime === "loading"}><ShieldCheck /> {runtime === "loading" ? "Checking..." : "Run setup check"}</button><button className="button primary" onClick={() => void startSession()} disabled={runtime === "loading"}><Play weight="fill" /> Start assessment</button></div>
              </div>}
            </article>

            <article className="timeline-card">
              <div className="card-heading"><div><strong>Key movement phases</strong><span>Temporal salience across the current phrase</span></div><span className="frame-count">{Math.min(processedFrameCount, 96)} / 96 frame window · {coverage}% coverage</span></div>
              <div className="salience" aria-label="Temporal salience chart">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ height: `${18 + (assessment.temporalSalience[index] ?? 0) * 38}px` }} className={(assessment.temporalSalience[index] ?? 0) > .72 ? "peak" : ""} />)}</div>
              <div className="key-moments">{keyMoments.length ? keyMoments.map((moment) => <div className="moment" key={moment.id}><div className="moment-preview"><img src={studioBackground} alt="" /><PoseCanvas landmarks={moment.landmarks} compact /></div><span><strong>{moment.label}</strong><small>{formatTime(moment.timestamp)} · score {Math.round(moment.score || assessment.overall)}</small></span></div>) : <EmptyTimeline />}</div>
            </article>
          </div>

          <aside className="score-column">
            <article className="score-summary">
              <div className="score-block"><span>Overall score</span><strong>{assessment.overall ? assessment.overall.toFixed(1) : "--"}</strong><small>/100</small></div>
              <div className="quality-block"><span>Quality level</span><strong>{assessment.overall ? assessment.quality : "Awaiting movement"}</strong><QualityStars score={assessment.overall} /></div>
              <div className="confidence"><span>Evidence confidence</span><strong>{assessment.confidence ? `${Math.round(assessment.confidence * 100)}%` : "--"}</strong></div>
            </article>
            <article className="panel scores-panel"><div className="panel-title"><div><strong>Movement profile</strong><span>Six assessment dimensions</span></div><span>Score</span></div><div className="metrics-list">{DIMENSIONS.map((name) => <MetricBar key={name} name={name} value={assessment.dimensions[name]} />)}</div></article>
            <article className="panel feedback-panel"><div className="panel-title"><div><strong>Coach cues</strong><span>Evidence-linked actions</span></div><span>{assessment.cues.length} cues</span></div>
              <div className="feedback-list">{assessment.cues.length ? assessment.cues.map((cue) => <div className={`feedback-item ${cue.severity}`} key={cue.id}><span className="feedback-icon" style={{ background: DIMENSION_META[cue.category].color }}>{cue.category[0]}</span><div><strong>{cue.category}<small>{cue.phase}</small></strong><p>{cue.observation}</p><span>{cue.action}</span></div></div>) : <div className="panel-empty"><Sparkle /><strong>Feedback builds from movement</strong><span>Start the assessment to receive precise coaching cues.</span></div>}</div>
            </article>
          </aside>
        </section>
      </main>}

      {view === "review" && <main className="page review-page">{selectedRecord ? <>
        <div className="page-title"><div><span className="eyebrow">Session review · {selectedRecord.id}</span><h1>{selectedRecord.config.routine}</h1><p>{selectedRecord.config.dancerName || "Guest dancer"} · {selectedRecord.config.style} · {formatDate(selectedRecord.completedAt)}</p></div><div className="review-actions"><button className="button secondary" onClick={() => exportSession(selectedRecord)}><DownloadSimple /> Export JSON</button><button className="button primary" onClick={() => window.print()}><Printer /> Print report</button></div></div>
        <section className="review-hero">
          <div className="review-score"><span>Session score</span><strong>{selectedRecord.assessment.overall.toFixed(1)}</strong><small>{selectedRecord.assessment.quality}</small></div>
          <div className="review-statement"><span className="eyebrow">Lead finding</span><h2>{[...DIMENSIONS].sort((a, b) => selectedRecord.assessment.dimensions[b] - selectedRecord.assessment.dimensions[a])[0]} is the strongest control signal.</h2><p>The next gain sits in {[...DIMENSIONS].sort((a, b) => selectedRecord.assessment.dimensions[a] - selectedRecord.assessment.dimensions[b])[0].toLowerCase()}. Use the evidence below to target the next repetition.</p></div>
          <div className="review-meta"><div><span>Duration</span><strong>{formatTime(selectedRecord.duration)}</strong></div><div><span>Pose frames</span><strong>{selectedRecord.frameCount}</strong></div><div><span>Inference</span><strong>{selectedRecord.assessment.inferenceMode === "validated-model" ? "Validated model" : "Kinematics"}</strong></div><div><span>Status</span><strong className={selectedRecord.approved ? "approved" : "draft"}>{selectedRecord.approved ? "Instructor approved" : "Draft review"}</strong></div></div>
        </section>
        <section className="review-grid">
          <article className="panel review-profile"><div className="panel-title"><div><strong>Movement profile</strong><span>Session-level dimension scores</span></div></div><div className="metrics-list">{DIMENSIONS.map((name) => <MetricBar key={name} name={name} value={selectedRecord.assessment.dimensions[name]} />)}</div></article>
          <article className="panel joint-evidence"><div className="panel-title"><div><strong>Joint contribution</strong><span>Relative support for interpretation</span></div><span>Top regions</span></div><div className="joint-list">{Object.entries(selectedRecord.assessment.jointContributions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([joint, weight]) => <div key={joint}><span>{joint}</span><span className="joint-track"><i style={{ width: `${weight * 420}%` }} /></span><strong>{Math.round(weight * 100)}%</strong></div>)}</div><p className="evidence-note"><Info weight="fill" /> Contributions are supportive evidence for review. They do not establish causal determinants of quality.</p></article>
        </section>
        <section className="panel instructor-panel"><div className="panel-title"><div><strong>Instructor-supervised feedback</strong><span>Select, edit, and approve the cues delivered to the dancer.</span></div><span>{selectedRecord.editedFeedback.filter((cue) => cue.selected).length || selectedRecord.assessment.cues.filter((cue) => cue.selected).length} selected</span></div>
          <div className="editable-feedback">{(selectedRecord.editedFeedback.length ? selectedRecord.editedFeedback : selectedRecord.assessment.cues).map((cue) => <div className="editable-cue" key={cue.id}><label className="cue-check"><input type="checkbox" checked={cue.selected} onChange={(e) => updateCue(cue.id, { selected: e.target.checked })} /><span><Check /></span></label><div><div className="cue-heading"><span style={{ color: DIMENSION_META[cue.category].color }}>{cue.category}</span><small>{cue.phase} · {cue.joints.join(", ")}</small></div><p>{cue.observation}</p><label className="edit-line"><PencilSimple /><input value={cue.action} onChange={(e) => updateCue(cue.id, { action: e.target.value })} aria-label={`Edit ${cue.category} feedback`} /></label></div></div>)}</div>
          <div className="instructor-footer"><label><span>Instructor note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context, progression, or a cue for the next repetition..." /></label><div><button className={`button ${approved ? "approved-button" : "primary"}`} onClick={approveRecord}>{approved ? <CheckCircle weight="fill" /> : <ShieldCheck />}{approved ? "Approved for delivery" : "Approve feedback"}</button><small>Approval is stored with this local session record.</small></div></div>
        </section>
        <button className="next-session" onClick={resetSession}><span><strong>Run the next repetition</strong><small>Return to Studio with the current routine as your starting point.</small></span><ArrowRight /></button>
      </> : <div className="empty-page"><Target /><h1>No session to review</h1><p>Complete an assessment or open one from Progress.</p><button className="button primary" onClick={() => setView("studio")}>Open Studio</button></div>}</main>}

      {view === "progress" && <main className="page progress-page">
        <div className="page-title"><div><span className="eyebrow">Local progress</span><h1>Practice history</h1><p>Session records stay in this browser until you remove them.</p></div>{history.length > 0 && <button className="button danger" onClick={() => { clearSessions(); setHistory([]); setCompareIds([]); }}><Trash /> Clear history</button>}</div>
        {history.length ? <>
          <section className="progress-stats"><div><span>Completed sessions</span><strong>{history.length}</strong><small>Stored locally</small></div><div><span>Average score</span><strong>{progressAverage.toFixed(1)}</strong><small>Across all styles</small></div><div><span>Latest change</span><strong className={latestDelta >= 0 ? "positive" : "negative"}>{latestDelta >= 0 ? "+" : ""}{latestDelta.toFixed(1)}</strong><small>Versus prior session</small></div><div><span>Best dimension</span><strong>{[...DIMENSIONS].sort((a, b) => history[0].assessment.dimensions[b] - history[0].assessment.dimensions[a])[0]}</strong><small>Latest session</small></div></section>
          {comparison.length > 0 && <section className="panel comparison"><div className="panel-title"><div><strong>Session comparison</strong><span>Select up to two sessions below</span></div><button className="text-button" onClick={() => setCompareIds([])}>Clear comparison</button></div><div className="comparison-grid">{DIMENSIONS.map((name) => <div key={name}><strong>{name}</strong>{comparison.map((item, index) => <span key={item.id}><i style={{ width: `${item.assessment.dimensions[name]}%`, background: index ? "#233c4f" : DIMENSION_META[name].color }} /><small>{Math.round(item.assessment.dimensions[name])}</small></span>)}</div>)}</div></section>}
          <section className="history-list">{history.map((item) => <article className="history-card" key={item.id}><label className="compare-check" title="Compare session"><input type="checkbox" checked={compareIds.includes(item.id)} onChange={(e) => setCompareIds((current) => e.target.checked ? [...current.filter((id) => id !== item.id), item.id].slice(-2) : current.filter((id) => id !== item.id))} /><span /></label><div className="history-score"><strong>{item.assessment.overall.toFixed(1)}</strong><small>{item.assessment.quality}</small></div><div className="history-main"><span className="eyebrow">{item.config.style} · {item.config.level}</span><h2>{item.config.routine}</h2><p>{formatDate(item.completedAt)} · {formatTime(item.duration)} · {item.config.source}</p></div><div className="history-mini">{DIMENSIONS.slice(0, 3).map((name) => <MetricBar key={name} name={name} value={item.assessment.dimensions[name]} compact />)}</div><div className="history-actions"><button className="button secondary" onClick={() => { setRecord(item); setApproved(item.approved); setNote(item.instructorNote); setView("review"); }}>Open review</button><button className="icon-button danger-icon" onClick={() => setHistory(deleteSession(item.id))} aria-label={`Delete ${item.id}`}><Trash /></button></div></article>)}</section>
        </> : <div className="empty-page"><ChartLineUp /><h1>Your training signal starts here</h1><p>Complete a session to build dimension trends and compare repetitions.</p><button className="button primary" onClick={() => setView("studio")}><Play weight="fill" /> Start first assessment</button></div>}
      </main>}
      <footer><span>{poseRuntimeMeta.name} · {poseRuntimeMeta.landmarks} landmarks</span><span>Schema v1 · local-first</span></footer>
    </div>
  );
}
