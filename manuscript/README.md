# Manuscript-aligned materials

This folder preserves selected material from `delivery/Dance_Scoring_Submission_Integration`, using the SCI submission manuscript as the visual source of record.

| Repository file | Source in the local submission package | Relationship |
| --- | --- | --- |
| `figures/figure_04_prototype_interface.png` | `Updated_Figures/figure_04_prototype_interface.png` | Byte-identical to Figure 4 embedded in `Dance_Scoring_Manuscript_SCI_Submission.docx` |
| `figures/figure_06_joint_contribution.png` | `Updated_Figures/figure_06_joint_contribution.png` | Byte-identical to Figure 6 embedded in `Dance_Scoring_Manuscript_SCI_Submission.docx` |
| `interface-prototype/` | `Platform_Prototype/dance-scoring-terminal-open/` | Original static HTML, CSS, and JavaScript interface scaffold from the submission package |

The Figure 4 image is an interface illustration containing placeholder scores. The static scaffold demonstrates its workflow; its `preview-desktop.png` and `preview-mobile.png` are screenshots of that scaffold, not copies of Figure 4. The root React application is a later, separately implemented operational terminal and has its own QA screenshots.

The Figure 6 plotting script at `../visualization/generate_fig6_top_contributions.py` generates a standalone bar chart from the twelve published ranked values. The complete manuscript Figure 6, including the skeleton map, is supplied as the final image here.

Other manuscript figures are not part of this code-oriented release. Figure 1 contains an identifiable performer and is intentionally excluded from the public repository pending confirmation of image-publication rights.
