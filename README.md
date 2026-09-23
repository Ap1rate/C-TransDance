# Dance Scoring Terminal

A complete local-first studio platform for real-time dance movement assessment and explainable coaching feedback. The product implements the operational workflow specified by the companion manuscript in `../V7_submission_reference_package/V7/`.

## Product workflow

1. Configure dancer, verified dance style, routine, experience level, and movement source.
2. Run the bundled real-dancer demo, connect a browser camera, or choose a local video.
3. Extract a 33-landmark pose in the browser and maintain a rolling 96-frame window.
4. Score posture, rhythm, amplitude, coordination, balance, and style from measured pose kinematics.
5. Review temporal salience, joint contribution, key phases, and constrained coaching cues.
6. Edit and approve instructor feedback, print the report, export JSON, and compare locally stored sessions.

Camera frames and uploaded video stay on the device. MediaPipe WebAssembly and the Pose Landmarker Lite model are bundled under `public/mediapipe`, so inference starts locally without a model download.

## Run

```bash
pnpm install
pnpm dev --host 0.0.0.0 --port 4173
```

Open `http://localhost:4173`. Use `http://localhost:4173/?run=1` for an auto-running guided demonstration.

## Quality checks

```bash
pnpm lint
pnpm test
pnpm build
```

## Inference modes

- `demo-pose`: licensed real-dancer sample analyzed live by the bundled MediaPipe runtime and local kinematics engine.
- `pose-kinematics`: camera or video landmarks scored from alignment, motion range, support stability, coordination, velocity regularity, and style-conditioned signals.
- `validated-model`: versioned adapter contract for a validated CNN-Transformer or equivalent model.

The manuscript package does not contain trained weights, training code, or the private dataset. The platform therefore exposes its inference mode in every live session and does not present the built-in engine as the manuscript's held-out experimental model. `src/services/modelAdapter.ts` is the exact integration boundary for validated model output, including regression score, six dimensions, feedback labels, temporal salience, joint contribution, latency, confidence, and model metadata.

## Architecture

- `src/domain`: typed pose, assessment, feedback, session, and scoring rules.
- `src/services`: MediaPipe runtime, validated-model adapter, local persistence, and export.
- `src/components`: data-driven pose overlay.
- `src/App.tsx`: Studio, Review, and Progress workflows.

Session records use schema version 1 and are stored in browser local storage. The app retains the latest 40 sessions.

## Browser requirements

- Current Chrome, Edge, or another browser with WebAssembly and modern media APIs.
- HTTPS or localhost for camera permissions.
- H.264 MP4 or WebM decoding support for uploaded files.

The real-video Demo and pose model remain fully functional when camera access and network access are unavailable. Test fixtures, provenance, licenses, and expected behaviors are documented in `test-data/SOURCES.md`.

## Real-video verification

- Built-in sample: 9-second single-dancer MP4, 100% pose coverage in the final browser regression, aligned pose overlay, automatic review report.
- Uploaded sample: 31.8-second public-domain WebM, metadata recognized at 768×576, pose reacquisition after temporary loss, manual finish, stored review with 380 detected frames.
- Three-person sample: 1080×1080 WebM, two concurrent poses reported, highest-visibility subject selected, 100% sampled-frame coverage during the regression window.
- Repeated-video regression: consecutive runs retain pose output after the media clock resets to zero.
- Automated checks: 10 tests across scoring, persistence, validated-model normalization, and video timing.
