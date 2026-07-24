#!/usr/bin/env python3
"""Rebuild the pizza charts from the CSV used by the website."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from matplotlib.ticker import MaxNLocator


DATA_PATH = Path("data/pizzerias - Pizza.csv")
COUNTS_CHART_PATH = Path("images/pizzeria_counts.png")
RATINGS_CHART_PATH = Path("images/pizzeria_ratings.png")

C_BLUE = "xkcd:faded blue"
C_LIGHT_GREY = "xkcd:light grey"

sns.set_theme(style="whitegrid", context="talk")
plt.rcParams.update(
    {
        "font.family": ["Trebuchet MS", "DejaVu Sans", "sans-serif"],
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.titleweight": "bold",
        "axes.titlesize": 17,
        "axes.labelsize": 13,
        "xtick.labelsize": 11,
        "ytick.labelsize": 11,
        "legend.frameon": False,
        "savefig.dpi": 220,
    }
)

pizzerias = pd.read_csv(DATA_PATH)
required_columns = {"State", "Rating"}
missing_columns = sorted(required_columns - set(pizzerias.columns))
if missing_columns:
    raise ValueError("Pizza CSV is missing columns: " + ", ".join(missing_columns))

pizzerias["Rating"] = pd.to_numeric(pizzerias["Rating"], errors="raise")
pizzerias["State"] = pizzerias["State"].astype("string").str.strip()
pizzerias = pizzerias.dropna(subset=["State", "Rating"])
pizzerias = pizzerias[pizzerias["State"] != ""]
if pizzerias.empty:
    raise ValueError("Pizza CSV contains no rows with a state and numeric rating")

state_summary = (
    pizzerias.groupby("State", as_index=False)
    .agg(
        **{
            "Average Rating": ("Rating", "mean"),
            "Number of Ratings": ("Rating", "count"),
        }
    )
    .sort_values(["Number of Ratings", "State"], ascending=[False, True])
)

COUNTS_CHART_PATH.parent.mkdir(parents=True, exist_ok=True)

fig, ax = plt.subplots(figsize=(10, 5))
sns.barplot(
    data=state_summary,
    x="State",
    y="Number of Ratings",
    color=C_BLUE,
    ax=ax,
)
ax.set_title("Pizzeria Ratings by State / Country", pad=12)
ax.set_xlabel("")
ax.set_ylabel("Number of Ratings")
ax.tick_params(axis="x", rotation=45)
ax.grid(axis="x", visible=False)
ax.grid(axis="y", color=C_LIGHT_GREY, linewidth=0.8, alpha=0.6)
sns.despine(ax=ax)
fig.tight_layout()
fig.savefig(COUNTS_CHART_PATH, bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(10, 5))
sns.histplot(data=pizzerias, x="Rating", bins=5, color=C_BLUE, ax=ax)
ax.set_title("Distribution of Pizzeria Ratings", pad=12)
ax.set_xlabel("Rating")
ax.set_ylabel("Count")
ax.xaxis.set_major_locator(MaxNLocator(integer=True))
ax.grid(axis="x", visible=False)
ax.grid(axis="y", color=C_LIGHT_GREY, linewidth=0.8, alpha=0.6)
sns.despine(ax=ax)
fig.tight_layout()
fig.savefig(RATINGS_CHART_PATH, bbox_inches="tight")
plt.close(fig)

print(
    f"Built {COUNTS_CHART_PATH} and {RATINGS_CHART_PATH} "
    f"from {len(pizzerias)} pizzeria rows"
)
