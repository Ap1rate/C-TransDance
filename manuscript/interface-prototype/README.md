# Dance Scoring Terminal

A lightweight open-source web prototype for a real-time dance scoring terminal. The interface is designed to match a journal figure-style prototype: video or demo canvas, skeleton overlay, overall score, quality level, sub-score dimensions, explainable feedback, key-frame timeline, and session export.

## Features

- Single-page app with no build step.
- Demo skeleton animation for quick presentation and screenshots.
- Optional browser camera input with canvas pose overlay.
- Live scaffold scoring for posture, rhythm, amplitude, coordination, balance, and style.
- Explainable feedback panel and key-frame timeline.
- JSON export for session review.
- Clear replacement point for a real model adapter.

## Quick Start

```bash
python3 -m http.server 4173
```

or:

```bash
npm run start
```

Open:

```text
http://localhost:4173
```

For an auto-running demo preview, open:

```text
http://localhost:4173?run=1
```

## Project Structure

```text
.
├── index.html
├── styles.css
├── app.js
├── README.md
├── LICENSE
└── .gitignore
```

## Model Adapter

The current scoring logic is a demo scaffold in `scoreFrame()` inside `app.js`. Before using the project for empirical research claims, replace `scoreFrame()` with a validated inference adapter, for example:

```js
async function scoreFrameWithModel(poseSequence, styleLabel) {
  return {
    overall: 86.2,
    level: "Good",
    dimensions: {
      Posture: 88,
      Rhythm: 84,
      Amplitude: 83,
      Coordination: 87,
      Balance: 85,
      Style: 86
    },
    cues: []
  };
}
```

Recommended real pipeline:

1. Browser camera or uploaded video.
2. Pose estimation with MediaPipe, OpenPose, MMPose, or a comparable pose library.
3. Sequence normalization and temporal windowing.
4. CNN-Transformer inference.
5. Score calibration and explainability rendering.

## Research Use Notice

This repository is an interface and integration scaffold. The built-in score stream is not a validated dance assessment model and should not be reported as experimental evidence.

## License

MIT

