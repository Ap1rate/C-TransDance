# Real-video test corpus

These fixtures exercise the browser upload and pose-analysis path. They are retained at their source resolution and are never transmitted by the application.

| File | Test role | Source and author | License |
| --- | --- | --- | --- |
| `../public/samples/real-dance-sample.mp4` | Built-in positive control, single dancer, full body, 9 seconds | [`Dance.mp4`](https://github.com/Qengineering/TensorFlow_Lite_Pose_RPi_32-bits/blob/master/Dance.mp4), Q-engineering pose example repository | [BSD-3-Clause repository license](https://github.com/Qengineering/TensorFlow_Lite_Pose_RPi_32-bits/blob/master/LICENSE) |
| `acrobat-single-person.webm` | Dynamic single-subject upload, changing scale and temporary loss of full-body visibility | [`Acrobaat.webm`](https://commons.wikimedia.org/wiki/File:Acrobaat.webm), Polygoon Hollands Nieuws / Nederlands Instituut voor Beeld en Geluid | Public domain |
| `bowery-waltz-two-person.webm` | Two-person ambiguity and primary-subject selection | [`Bowery Waltz (1897).webm`](https://commons.wikimedia.org/wiki/File:Bowery_Waltz_(1897).webm), William Heise | Public domain |
| `huntrix-three-person.webm` | Modern three-person dance and crowded-background stress test | [`ANYC25 Huntrix cosplay dance`](https://commons.wikimedia.org/wiki/File:ANYC25_from_YouTube_video_by_TBC_-_Huntrix_cosplay_dance.webm), The Cosplay Baker | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `baamaya-crowded-dance.webm` | Lead dancer with bystanders and vertical phone framing | [`A woman dancing baamaya dance in Northern Ghana.webm`](https://commons.wikimedia.org/wiki/File:A_woman_dancing_baamaya_dance_in_Northern_Ghana.webm), Sir Amugi | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

## Acceptance matrix

| Scenario | Expected behavior |
| --- | --- |
| Positive single dancer | Video metadata becomes the session clock, pose coverage rises, points align with the visible body, scores and report are produced. |
| Temporary subject loss | Coverage decreases, stale points clear after 12 misses, framing guidance appears, analysis resumes when the body returns. |
| Multiple people | Up to two poses are detected, the highest-visibility subject is scored, and the interface reports the number of people in frame. |
| Video end | The session finishes from the media `ended` signal and stores the actual media time and total detected-frame count. |
| Repeated sessions | MediaPipe receives a strictly increasing internal timestamp while each report retains its own zero-based video time. |

For full research benchmarking, the [AIST++ Dance Motion Dataset](https://google.github.io/aistplusplus_dataset/) provides 1,408 dance sequences with 2D and 3D annotations. Its multi-gigabyte archives remain an external benchmark rather than an application fixture.
