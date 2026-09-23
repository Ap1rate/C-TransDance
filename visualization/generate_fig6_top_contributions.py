"""Recreate the Figure 6 top-joint contribution chart from reported values."""

from pathlib import Path

import matplotlib.pyplot as plt


OUTPUT_DIR = Path(__file__).resolve().parent / "output"

JOINTS = [
    ("Left ankle", 0.08255, "High"),
    ("Left knee", 0.07837, "High"),
    ("Right ankle", 0.073145, "High"),
    ("Right knee", 0.068966, "Medium"),
    ("Left hip", 0.063741, "Medium"),
    ("Right hip", 0.060606, "Medium"),
    ("Left wrist", 0.054336, "Medium"),
    ("Left elbow", 0.049112, "Medium"),
    ("Right wrist", 0.049112, "Medium"),
    ("Left shoulder", 0.048067, "Medium"),
    ("Right elbow", 0.045977, "Medium"),
    ("Right shoulder", 0.044932, "Medium"),
]

COLORS = {"High": "#F2381B", "Medium": "#F39A1E", "Low": "#71B7B3"}


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    labels = [name for name, _, _ in JOINTS][::-1]
    values = [value for _, value, _ in JOINTS][::-1]
    colors = [COLORS[level] for _, _, level in JOINTS][::-1]

    fig, ax = plt.subplots(figsize=(7.2, 4.8))
    ax.barh(labels, values, color=colors, edgecolor="none")
    ax.set_xlabel("Contribution weight")
    ax.set_title("Top joint contribution weights")
    ax.set_xlim(0, 0.10)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="x", color="#E5E7EB", linewidth=0.8)
    ax.set_axisbelow(True)

    for y, value in enumerate(values):
        ax.text(value + 0.002, y, f"{value:.6g}", va="center", fontsize=9)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "figure_06_top_contributions_reproducible.png", dpi=300)
    fig.savefig(OUTPUT_DIR / "figure_06_top_contributions_reproducible.svg")


if __name__ == "__main__":
    main()

