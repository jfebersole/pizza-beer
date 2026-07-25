#!/usr/bin/env python3
"""Rebuild the beer data, brewery data, VORB rankings, and beer charts.

By default, the script rebuilds every derived artifact from
``inputs/beer_data.csv`` and ``inputs/brewery_data.csv``. It can first refresh
those inputs from their public Google Drive files. Rows without a personal
rating are excluded from the rating analysis. Beer styles are assigned with
``inputs/styles_cross.xlsx``. Existing coordinates are reused from
``data/brewery_data.geojson`` and only new, pending breweries are geocoded.

Examples
--------
Rebuild the website inputs without making any geocoding requests:

    python scripts/sync_untappd_content.py --skip-geocoding

Pull the current Drive CSVs, then rebuild without geocoding:

    python scripts/sync_untappd_content.py --refresh-inputs --skip-geocoding

Rebuild the website inputs and geocode only new breweries with Geoapify:

    GEOAPIFY_API_KEY=... python scripts/sync_untappd_content.py
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
import requests
import seaborn as sns


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BEER_DRIVE_FILE_ID = "1lyVM6_Jg8ewc2JpnS4Tq0I3Md9y01lbW"
DEFAULT_BREWERY_DRIVE_FILE_ID = "1ChsEwl6MPa4UrAKg8BmzHLkstcef6lNv"
DRIVE_DOWNLOAD_URL = "https://drive.usercontent.google.com/download"
USER_AGENT = "pizza-beer-site-sync/1.0"
BEER_COLUMNS = [
    "Label",
    "Beer",
    "Brewery",
    "Style",
    "ABV",
    "My Rating",
    "Untappd Rating",
]
BEER_CSV_COLUMNS = [
    "Beer Name",
    "Brewery Name",
    "Style",
    "ABV",
    "My Rating",
    "Global Rating",
    "Beer URL",
    "Brewery Filepath",
    "Image URL",
]
BREWERY_CSV_COLUMNS = [
    "Brewery Name",
    "description",
    "image_url",
    "ratingValue",
    "bestRating",
    "reviewCount",
    "streetAddress",
    "addressLocality",
    "addressRegion",
    "telephone",
    "warningservesCuisine",
]
STYLE_COLUMNS = ["Style", "Style Family"]
MIN_BEERS_FOR_VORB = 3
MIN_STYLE_BEERS_FOR_VORB = 2
GEOCODING_DELAY_SECONDS = 0.25

BEER_NAME_CORRECTIONS = {
    "Lawsons Faystons Barrel Aged In Whiskey Barrels With Coffee": (
        "Fayston Maple Imperial Stout with Coffee - Aged in Whiskey Barrels"
    ),
}
BEER_LABEL_CORRECTIONS = {
    "Fayston Maple Imperial Stout with Coffee - Aged in Whiskey Barrels": (
        "https://www.lawsonsfinest.com/wp-content/uploads/"
        "FMIS_WithCoffee_BA_Lockup_Solid.png"
    ),
}
STYLE_FAMILY_OVERRIDES = {
    "Dwell (Batch 1)": "Sours+Farmhouse+Wild",
}

C_BLUE = "xkcd:faded blue"
C_ORANGE = "xkcd:faded orange"
C_GREY = "xkcd:charcoal grey"
C_LIGHT_GREY = "xkcd:light grey"
C_BG = "none"

sns.set_theme(style="whitegrid", context="talk")
sns.set_palette([C_BLUE, C_ORANGE, C_GREY])
plt.rcParams.update(
    {
        "font.family": ["Trebuchet MS", "DejaVu Sans", "sans-serif"],
        "font.size": 16,
        "axes.titleweight": "semibold",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "figure.facecolor": C_BG,
        "axes.facecolor": C_BG,
        "savefig.dpi": 220,
        "savefig.transparent": True,
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--beer-csv",
        type=Path,
        default=REPO_ROOT / "inputs/beer_data.csv",
        help="Authoritative beer CSV (default: inputs/beer_data.csv).",
    )
    parser.add_argument(
        "--brewery-csv",
        type=Path,
        default=REPO_ROOT / "inputs/brewery_data.csv",
        help="Brewery metadata CSV (default: inputs/brewery_data.csv).",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=REPO_ROOT,
        help="Directory that receives data/ and images/ (default: repository root).",
    )
    parser.add_argument(
        "--styles-cross",
        type=Path,
        default=REPO_ROOT / "inputs/styles_cross.xlsx",
        help="Style-to-family Excel crosswalk (default: inputs/styles_cross.xlsx).",
    )
    parser.add_argument(
        "--skip-geocoding",
        action="store_true",
        help="Do not geocode new breweries, even when an address is available.",
    )
    parser.add_argument(
        "--refresh-inputs",
        action="store_true",
        help="Download and validate the public Google Drive CSVs before rebuilding.",
    )
    parser.add_argument(
        "--beer-drive-file-id",
        default=DEFAULT_BEER_DRIVE_FILE_ID,
        help="Public Google Drive file ID for the beer CSV.",
    )
    parser.add_argument(
        "--brewery-drive-file-id",
        default=DEFAULT_BREWERY_DRIVE_FILE_ID,
        help="Public Google Drive file ID for the brewery CSV.",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def require_columns(frame: pd.DataFrame, required: list[str], path: Path) -> None:
    missing_columns = sorted(set(required) - set(frame.columns))
    if missing_columns:
        raise ValueError(f"{path} is missing columns: {', '.join(missing_columns)}")


def fetch_drive_csv(file_id: str) -> bytes:
    """Download a public Google Drive file without using browser cookies."""
    try:
        response = requests.get(
            DRIVE_DOWNLOAD_URL,
            params={"id": file_id, "export": "download", "confirm": "t"},
            timeout=120,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise RuntimeError(
            f"Could not download public Google Drive file {file_id!r}"
        ) from error
    if not response.content:
        raise ValueError(f"Google Drive file {file_id!r} is empty")
    return response.content


def validate_csv_bytes(
    content: bytes, required_columns: list[str], source_name: str
) -> None:
    """Reject Drive error pages, swapped inputs, and empty CSVs before writing."""
    try:
        frame = pd.read_csv(io.BytesIO(content))
    except ValueError as error:
        raise ValueError(f"Downloaded {source_name} is not a readable CSV") from error
    missing_columns = sorted(set(required_columns) - set(frame.columns))
    if missing_columns:
        raise ValueError(
            f"Downloaded {source_name} is missing columns: "
            + ", ".join(missing_columns)
        )
    if frame.empty:
        raise ValueError(f"Downloaded {source_name} contains no data rows")


def atomic_write_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".download", dir=path.parent
    )
    try:
        with os.fdopen(file_descriptor, "wb") as output_file:
            output_file.write(content)
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def refresh_inputs_from_drive(
    beer_file_id: str,
    brewery_file_id: str,
    beer_path: Path,
    brewery_path: Path,
) -> list[Path]:
    """Validate both remote inputs before atomically replacing either local file."""
    downloads = [
        (beer_path, fetch_drive_csv(beer_file_id), BEER_CSV_COLUMNS, "beer CSV"),
        (
            brewery_path,
            fetch_drive_csv(brewery_file_id),
            BREWERY_CSV_COLUMNS,
            "brewery CSV",
        ),
    ]
    for _, content, columns, source_name in downloads:
        validate_csv_bytes(content, columns, source_name)

    changed_paths = []
    for path, content, _, _ in downloads:
        if path.is_file() and path.read_bytes() == content:
            continue
        atomic_write_bytes(path, content)
        changed_paths.append(path)

    if changed_paths:
        paths = ", ".join(str(path) for path in changed_paths)
        print(f"Refreshed Drive inputs: {paths}")
    else:
        print("The public Google Drive inputs are unchanged.")
    return changed_paths


def load_beer_csv(path: Path) -> tuple[pd.DataFrame, dict[str, str], int]:
    source = pd.read_csv(path)
    require_columns(source, BEER_CSV_COLUMNS, path)
    source = source[BEER_CSV_COLUMNS].copy()

    unrated = source["My Rating"].isna() | source["My Rating"].astype(
        str
    ).str.strip().isin(["", "N/A"])
    unrated_count = int(unrated.sum())
    source = source.loc[~unrated].copy()

    for column in [
        "Beer Name",
        "Brewery Name",
        "Style",
        "ABV",
        "Beer URL",
        "Brewery Filepath",
        "Image URL",
    ]:
        source[column] = source[column].fillna("").astype(str).str.strip()

    brewery_urls = dict(
        source[["Brewery Name", "Brewery Filepath"]]
        .drop_duplicates("Brewery Name", keep="last")
        .itertuples(index=False, name=None)
    )
    beers = source.rename(
        columns={
            "Image URL": "Label",
            "Beer Name": "Beer",
            "Brewery Name": "Brewery",
            "Global Rating": "Untappd Rating",
        }
    )
    return clean_beers(beers[BEER_COLUMNS]), brewery_urls, unrated_count


def clean_beers(beers: pd.DataFrame) -> pd.DataFrame:
    beers = beers.copy()
    for column in ["Label", "Beer", "Brewery", "Style", "ABV"]:
        beers[column] = beers[column].fillna("").astype(str).str.strip()
    for column in ["My Rating", "Untappd Rating"]:
        beers[column] = pd.to_numeric(beers[column], errors="raise")

    beers["Beer"] = beers["Beer"].replace(BEER_NAME_CORRECTIONS)
    for beer_name, label_url in BEER_LABEL_CORRECTIONS.items():
        beers.loc[beers["Beer"] == beer_name, "Label"] = label_url

    if beers[["Beer", "Brewery", "Style"]].eq("").any().any():
        raise ValueError("Beer, Brewery, and Style must be populated for every row")
    for column in ["My Rating", "Untappd Rating"]:
        if not beers[column].between(0, 5).all():
            raise ValueError(f"{column} values must be between 0 and 5")

    beers = beers.drop_duplicates(["Beer", "Brewery"], keep="last")
    return beers.sort_values(
        ["My Rating", "Untappd Rating", "Brewery", "Beer"],
        ascending=[False, False, True, True],
        kind="stable",
    ).reset_index(drop=True)


def load_style_crosswalk(path: Path) -> dict[str, str]:
    styles = pd.read_excel(path, dtype=str)
    missing_columns = sorted(set(STYLE_COLUMNS) - set(styles.columns))
    if missing_columns:
        raise ValueError(f"{path} is missing columns: {', '.join(missing_columns)}")

    styles = styles[STYLE_COLUMNS].copy()
    for column in STYLE_COLUMNS:
        styles[column] = styles[column].fillna("").astype(str).str.strip()
    if styles.eq("").any().any():
        raise ValueError(f"{path} contains a blank Style or Style Family")
    duplicated_styles = sorted(
        styles.loc[styles["Style"].duplicated(False), "Style"].unique()
    )
    if duplicated_styles:
        raise ValueError(
            f"{path} contains duplicate styles: {', '.join(duplicated_styles)}"
        )
    return dict(zip(styles["Style"], styles["Style Family"]))


def assign_style_families(
    beers: pd.DataFrame, style_crosswalk: dict[str, str]
) -> pd.DataFrame:
    styled = beers.copy()
    styled["Style Family"] = styled["Style"].map(style_crosswalk)
    for beer_name, family in STYLE_FAMILY_OVERRIDES.items():
        styled.loc[styled["Beer"] == beer_name, "Style Family"] = family

    missing_styles = sorted(styled.loc[styled["Style Family"].isna(), "Style"].unique())
    if missing_styles:
        raise ValueError(
            "Styles missing from the style crosswalk: " + ", ".join(missing_styles)
        )
    return styled


def build_brewery_summary(beers: pd.DataFrame) -> pd.DataFrame:
    summary = (
        beers.groupby("Brewery", sort=True)
        .agg(
            beers_rated=("Beer", "size"),
            my_rating=("My Rating", "mean"),
            top_rating=("My Rating", "max"),
            rating_sum=("My Rating", "sum"),
            untappd_rating=("Untappd Rating", "mean"),
        )
        .reset_index()
    )
    summary["avg_diff"] = summary["my_rating"] - summary["untappd_rating"]
    summary["brewery_rating"] = summary["my_rating"]

    multiple_beers = summary["beers_rated"] > 1
    rating_without_top = (
        summary.loc[multiple_beers, "rating_sum"]
        - summary.loc[multiple_beers, "top_rating"]
    ) / (summary.loc[multiple_beers, "beers_rated"] - 1)
    summary.loc[multiple_beers, "brewery_rating"] = (
        summary.loc[multiple_beers, "top_rating"] + rating_without_top
    ) / 2

    summary["VORB"] = pd.NA
    qualifies = summary["beers_rated"] >= MIN_BEERS_FOR_VORB
    replacement_rating = beers["My Rating"].mean()
    summary.loc[qualifies, "VORB"] = (
        summary.loc[qualifies, "brewery_rating"] - replacement_rating
    ) * 100
    return summary


def load_brewery_csv(path: Path) -> dict[str, dict[str, Any]]:
    breweries = pd.read_csv(path)
    require_columns(breweries, BREWERY_CSV_COLUMNS, path)
    breweries = breweries[BREWERY_CSV_COLUMNS].copy()
    breweries["Brewery Name"] = (
        breweries["Brewery Name"].fillna("").astype(str).str.strip()
    )
    if breweries["Brewery Name"].eq("").any():
        raise ValueError(f"{path} contains a blank Brewery Name")
    duplicate_names = sorted(
        breweries.loc[
            breweries["Brewery Name"].duplicated(False), "Brewery Name"
        ].unique()
    )
    if duplicate_names:
        raise ValueError(
            f"{path} contains duplicate breweries: {', '.join(duplicate_names)}"
        )

    metadata: dict[str, dict[str, Any]] = {}
    for source_record in breweries.to_dict(orient="records"):
        record = {
            key: "" if pd.isna(value) else value for key, value in source_record.items()
        }
        for column in [
            "Brewery Name",
            "description",
            "image_url",
            "streetAddress",
            "addressLocality",
            "addressRegion",
            "telephone",
            "warningservesCuisine",
        ]:
            record[column] = str(record[column]).strip()
        record["full_address"] = ", ".join(
            part
            for part in [
                record["streetAddress"],
                record["addressLocality"],
                record["addressRegion"],
            ]
            if part
        )
        record["City"] = record["addressLocality"]
        record["State"] = record["addressRegion"]
        metadata[record["Brewery Name"]] = record
    return metadata


def valid_geometry(geometry: Any) -> bool:
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return False
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return False
    longitude, latitude = coordinates
    return (
        isinstance(longitude, (int, float))
        and isinstance(latitude, (int, float))
        and -180 <= longitude <= 180
        and -90 <= latitude <= 90
    )


def geocode_geoapify(
    address: str, api_key: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    response = requests.get(
        "https://api.geoapify.com/v1/geocode/search",
        params={
            "text": address,
            "format": "json",
            "limit": 1,
            "apiKey": api_key,
        },
        timeout=30,
        headers={"User-Agent": "pizza-beer personal data updater"},
    )
    response.raise_for_status()
    payload = response.json()
    results = payload.get("results", [])
    if not results:
        raise ValueError(f"Geoapify returned no result for {address!r}")

    result = results[0]
    longitude = float(result["lon"])
    latitude = float(result["lat"])
    properties = {
        "Latitude": latitude,
        "Longitude": longitude,
        "City": result.get("city") or result.get("county", ""),
        "State": result.get("state_code") or result.get("state", ""),
        "Country": result.get("country", ""),
    }
    geometry = {"type": "Point", "coordinates": [longitude, latitude]}
    return geometry, properties


def geocoding_error_message(error: Exception) -> str:
    """Return a useful error without persisting a request URL or API key."""
    if isinstance(error, requests.HTTPError) and error.response is not None:
        return f"Geoapify geocoding returned HTTP {error.response.status_code}"
    if isinstance(error, requests.RequestException):
        return f"Geoapify geocoding request failed ({type(error).__name__})"
    return str(error)


def brewery_address_key(properties: dict[str, Any]) -> str:
    street = str(properties.get("streetAddress", "") or "").strip()
    if not street:
        return ""
    return "|".join(
        str(properties.get(column, "") or "").strip().casefold()
        for column in ["streetAddress", "addressLocality", "addressRegion"]
    )


def brewery_name_key(name: str) -> str:
    return "".join(character for character in name.casefold() if character.isalnum())


def find_renamed_brewery_feature(
    name: str,
    metadata: dict[str, Any],
    existing_by_address: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    address_key = brewery_address_key(metadata)
    if not address_key:
        return None

    new_image = str(metadata.get("image_url", "") or "")
    for feature in existing_by_address.get(address_key, []):
        if not valid_geometry(feature.get("geometry")):
            continue
        properties = feature.get("properties", {})
        old_name = str(properties.get("Brewery Name", "") or "")
        old_image = str(properties.get("image_url", "") or "")
        same_name = brewery_name_key(name) == brewery_name_key(old_name)
        same_image = (
            new_image == old_image
            and bool(new_image)
            and "badge-brewery-default" not in new_image
        )
        if same_name or same_image:
            return feature
    return None


def update_brewery_geojson(
    existing_geojson: dict[str, Any],
    summary: pd.DataFrame,
    brewery_urls: dict[str, str],
    brewery_metadata: dict[str, dict[str, Any]],
    skip_geocoding: bool,
) -> tuple[dict[str, Any], list[str]]:
    existing_features = existing_geojson.get("features", [])
    existing_names = {
        str(feature.get("properties", {}).get("Brewery Name", "")).strip()
        for feature in existing_features
    }
    feature_by_name = {
        str(feature.get("properties", {}).get("Brewery Name", "")).strip(): feature
        for feature in existing_features
        if str(feature.get("properties", {}).get("Brewery Name", "")).strip()
    }
    existing_by_address: dict[str, list[dict[str, Any]]] = {}
    for feature in existing_features:
        address_key = brewery_address_key(feature.get("properties", {}))
        if address_key:
            existing_by_address.setdefault(address_key, []).append(feature)

    summary_by_name = summary.set_index("Brewery")
    new_names = sorted(set(summary_by_name.index) - existing_names)
    for name in new_names:
        metadata = brewery_metadata.get(name, {})
        renamed_feature = find_renamed_brewery_feature(
            name, metadata, existing_by_address
        )
        if renamed_feature:
            properties = dict(renamed_feature.get("properties", {}))
            properties.pop("Geocoding Status", None)
            geometry = dict(renamed_feature["geometry"])
        else:
            properties = {
                "Brewery Name": name,
                "Geocoding Status": "pending",
            }
            geometry = None
        properties.update(metadata)
        if name in brewery_urls:
            properties["Brewery URL"] = brewery_urls[name]
        feature_by_name[name] = {
            "type": "Feature",
            "properties": properties,
            "geometry": geometry,
        }

    for name, metadata in brewery_metadata.items():
        if name not in feature_by_name:
            continue
        properties = feature_by_name[name]["properties"]
        previous_address = properties.get("full_address", "")
        previous_status = properties.get("Geocoding Status")
        properties.update(metadata)
        address_changed = properties.get("full_address", "") != previous_address
        if previous_status in {"failed", "pending"} and address_changed:
            properties["Geocoding Status"] = "pending"
            properties.pop("Geocoding Error", None)
        elif previous_status == "pending" and properties.get("Geocoding Error"):
            # Migrate failures written by an older script so Actions will not
            # spend another credit on the same unchanged address.
            properties["Geocoding Status"] = "failed"

    geocodable_pending_names = [
        name
        for name in summary_by_name.index
        if feature_by_name[name]["properties"].get("Geocoding Status") == "pending"
        if feature_by_name[name]["properties"].get("full_address")
        and not valid_geometry(feature_by_name[name].get("geometry"))
    ]
    if geocodable_pending_names and not skip_geocoding:
        api_key = os.environ.get("GEOAPIFY_API_KEY")
        if not api_key:
            names = ", ".join(geocodable_pending_names)
            raise ValueError(
                "GEOAPIFY_API_KEY is required to geocode these new breweries: "
                + names
            )
        for name in geocodable_pending_names:
            feature = feature_by_name[name]
            try:
                geometry, geocoded_properties = geocode_geoapify(
                    feature["properties"]["full_address"], api_key
                )
            except (
                KeyError,
                TypeError,
                ValueError,
                requests.RequestException,
            ) as error:
                feature["properties"]["Geocoding Status"] = "failed"
                feature["properties"]["Geocoding Error"] = geocoding_error_message(
                    error
                )
            else:
                feature["geometry"] = geometry
                feature["properties"]["Latitude"] = geocoded_properties["Latitude"]
                feature["properties"]["Longitude"] = geocoded_properties["Longitude"]
                for location_field in ["City", "State", "Country"]:
                    if (
                        not feature["properties"].get(location_field)
                        and geocoded_properties.get(location_field)
                    ):
                        feature["properties"][location_field] = geocoded_properties[
                            location_field
                        ]
                feature["properties"].pop("Geocoding Status", None)
                feature["properties"].pop("Geocoding Error", None)
            time.sleep(GEOCODING_DELAY_SECONDS)

    for name, row in summary_by_name.iterrows():
        feature = feature_by_name[name]
        properties = feature["properties"]
        properties["Brewery Name"] = name
        properties["Beers Rated"] = int(row["beers_rated"])
        properties["My Rating"] = float(row["my_rating"])
        properties["Global Rating"] = float(row["untappd_rating"])
        properties["Avg Diff"] = float(row["avg_diff"])
        properties["VORB"] = None if pd.isna(row["VORB"]) else float(row["VORB"])
        if valid_geometry(feature.get("geometry")):
            longitude, latitude = feature["geometry"]["coordinates"]
            properties["Longitude"] = longitude
            properties["Latitude"] = latitude

    features = [feature_by_name[name] for name in sorted(summary_by_name.index)]
    pending = [
        name
        for name in summary_by_name.index
        if not valid_geometry(feature_by_name[name].get("geometry"))
    ]
    return {"type": "FeatureCollection", "features": features}, pending


def build_vorb_rankings(
    summary: pd.DataFrame, geojson: dict[str, Any]
) -> list[dict[str, Any]]:
    properties_by_name = {
        feature["properties"]["Brewery Name"]: feature["properties"]
        for feature in geojson["features"]
    }
    qualifying = summary[summary["beers_rated"] >= MIN_BEERS_FOR_VORB].copy()
    qualifying = qualifying.sort_values(["VORB", "Brewery"], ascending=[False, True])

    records: list[dict[str, Any]] = []
    for row in qualifying.to_dict(orient="records"):
        properties = properties_by_name[row["Brewery"]]
        records.append(
            {
                "Logo": properties.get("image_url", ""),
                "Brewery": row["Brewery"],
                "Beers Rated": int(row["beers_rated"]),
                "VORB": int(row["VORB"]),
                "My Rating": round(float(row["my_rating"]), 2),
                "Untappd Rating": round(float(row["untappd_rating"]), 2),
                "Avg Diff": round(float(row["avg_diff"]), 2),
                "State": properties.get("State", ""),
            }
        )
    return records


def build_brewery_records(
    summary: pd.DataFrame, geojson: dict[str, Any]
) -> list[dict[str, Any]]:
    properties_by_name = {
        feature["properties"]["Brewery Name"]: feature["properties"]
        for feature in geojson["features"]
    }
    qualifying = summary[summary["beers_rated"] >= MIN_BEERS_FOR_VORB].copy()
    qualifying = qualifying.sort_values(["VORB", "Brewery"], ascending=[False, True])

    records: list[dict[str, Any]] = []
    for row in qualifying.to_dict(orient="records"):
        properties = properties_by_name[row["Brewery"]]
        records.append(
            {
                "name": row["Brewery"],
                "image_url": properties.get("image_url", ""),
                "State": properties.get("State", ""),
                "Country": properties.get("Country", ""),
                "Avg Beer Rating": float(row["my_rating"]),
                "Count": int(row["beers_rated"]),
                "Top Beer Rating": float(row["top_rating"]),
                "Global Avg Rating": float(row["untappd_rating"]),
                "Diff": float(row["avg_diff"]),
                "VORB": float(row["VORB"]),
            }
        )
    return records


def style_vorb(
    beers: pd.DataFrame, family: str, style_crosswalk: dict[str, str]
) -> pd.DataFrame:
    styled = assign_style_families(beers, style_crosswalk)
    family_beers = styled[styled["Style Family"] == family]
    if family_beers.empty:
        raise ValueError(f"No beers belong to style family {family!r}")
    replacement_rating = family_beers["My Rating"].mean()
    summary = (
        family_beers.groupby("Brewery")
        .agg(
            beers_rated=("Beer", "size"),
            top_rating=("My Rating", "max"),
            rating_sum=("My Rating", "sum"),
        )
        .reset_index()
    )
    summary = summary[summary["beers_rated"] >= MIN_STYLE_BEERS_FOR_VORB].copy()
    rating_without_top = (summary["rating_sum"] - summary["top_rating"]) / (
        summary["beers_rated"] - 1
    )
    summary["brewery_rating"] = (summary["top_rating"] + rating_without_top) / 2
    summary["VORB"] = (summary["brewery_rating"] - replacement_rating) * 100
    return summary.sort_values(["VORB", "Brewery"], ascending=[False, True])


def plot_vorb(rankings: pd.DataFrame, path: Path, title: str) -> None:
    width = min(24, max(12, 0.48 * len(rankings)))
    fig, ax = plt.subplots(figsize=(width, 8))
    colors = [C_BLUE if score >= 0 else C_ORANGE for score in rankings["VORB"]]
    sizes = (90 + 12 * rankings["Beers Rated"].clip(upper=20)).to_numpy()
    ax.scatter(
        rankings["Brewery"],
        rankings["VORB"],
        color=colors,
        s=sizes,
        marker="D",
        alpha=0.9,
    )
    ax.axhline(0, color=C_GREY, linestyle="--", linewidth=1.8)
    ax.set_title(title)
    ax.set_xlabel("")
    ax.set_ylabel("VORB")
    ax.tick_params(axis="x", rotation=90)
    ax.grid(True, axis="y", color=C_LIGHT_GREY, linewidth=0.8, alpha=0.6)
    ax.grid(False, axis="x")
    plt.tight_layout()
    fig.savefig(path, bbox_inches="tight", transparent=True)
    plt.close(fig)


def plot_style_density(
    beers: pd.DataFrame, path: Path, style_crosswalk: dict[str, str]
) -> None:
    styled = assign_style_families(beers, style_crosswalk)
    families = [
        "IPAs+",
        "Sours+Farmhouse+Wild",
        "Lagers+",
        "Stouts+Porters",
        "Smoked",
        "Wheat",
    ]
    fig, axes = plt.subplots(2, 3, figsize=(18, 12), sharex=True, sharey=False)
    for ax, family in zip(axes.flat, families):
        family_beers = styled[styled["Style Family"] == family]
        sns.kdeplot(
            data=family_beers,
            x="Untappd Rating",
            fill=True,
            color=C_ORANGE,
            label="Untappd Rating",
            clip=(2, 5),
            bw_adjust=0.8,
            ax=ax,
        )
        sns.kdeplot(
            data=family_beers,
            x="My Rating",
            fill=True,
            color=C_BLUE,
            label="My Rating",
            clip=(2, 5),
            bw_adjust=0.8,
            ax=ax,
        )
        ax.set_title(family)
        ax.set_xlim(2, 5)
        ax.set_xlabel("Rating" if ax in axes[1] else "")
        ax.set_ylabel("Density" if ax in axes[:, 0] else "")
        ax.set_yticks([])
        ax.grid(False)
        if ax.get_legend() is not None:
            ax.get_legend().remove()

    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.suptitle("Density of Ratings by Beer Style", y=0.995)
    fig.legend(
        handles,
        labels,
        loc="upper center",
        bbox_to_anchor=(0.5, 0.955),
        ncol=2,
        frameon=False,
    )
    plt.tight_layout(rect=(0, 0, 1, 0.9))
    fig.savefig(path, bbox_inches="tight", transparent=True)
    plt.close(fig)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2, allow_nan=False)
        file.write("\n")


def stage_outputs(
    output_root: Path,
    beers: pd.DataFrame,
    geojson: dict[str, Any],
    rankings: list[dict[str, Any]],
    brewery_records: list[dict[str, Any]],
    pending_breweries: list[str],
    brewery_urls: dict[str, str],
    style_crosswalk: dict[str, str],
) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".untappd-sync-", dir=output_root
    ) as temp_dir:
        stage_root = Path(temp_dir)
        data_dir = stage_root / "data"
        images_dir = stage_root / "images"
        data_dir.mkdir()
        images_dir.mkdir()

        write_json(
            data_dir / "beer_data.json", beers[BEER_COLUMNS].to_dict(orient="records")
        )
        write_json(data_dir / "VORB_data.json", rankings)
        write_json(data_dir / "brewery_data.json", brewery_records)
        write_json(data_dir / "brewery_data.geojson", geojson)
        properties_by_name = {
            feature["properties"]["Brewery Name"]: feature["properties"]
            for feature in geojson["features"]
        }
        write_json(
            data_dir / "pending_breweries.json",
            [
                {
                    "Brewery": name,
                    "Brewery URL": brewery_urls.get(name)
                    or properties_by_name[name].get("Brewery URL", ""),
                }
                for name in pending_breweries
            ],
        )

        ranking_frame = pd.DataFrame(rankings).rename(
            columns={"Beers Rated": "Beers Rated"}
        )
        plot_vorb(ranking_frame, images_dir / "vorb_chart.png", "VORB by Brewery")

        for family, filename in [
            ("IPAs+", "vorb_chart_ipa.png"),
            ("Lagers+", "vorb_chart_lager.png"),
        ]:
            family_ranking = style_vorb(beers, family, style_crosswalk).rename(
                columns={"beers_rated": "Beers Rated"}
            )
            plot_vorb(
                family_ranking[["Brewery", "VORB", "Beers Rated"]],
                images_dir / filename,
                f"VORB for {family}",
            )
        plot_style_density(
            beers, images_dir / "style_density_plot.png", style_crosswalk,
        )

        relative_paths = [
            Path("data/beer_data.json"),
            Path("data/VORB_data.json"),
            Path("data/brewery_data.json"),
            Path("data/brewery_data.geojson"),
            Path("data/pending_breweries.json"),
            Path("images/vorb_chart.png"),
            Path("images/vorb_chart_ipa.png"),
            Path("images/vorb_chart_lager.png"),
            Path("images/style_density_plot.png"),
        ]
        for relative_path in relative_paths:
            destination = output_root / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(stage_root / relative_path, destination)


def main() -> None:
    args = parse_args()
    if args.refresh_inputs:
        refresh_inputs_from_drive(
            args.beer_drive_file_id,
            args.brewery_drive_file_id,
            args.beer_csv,
            args.brewery_csv,
        )
    brewery_geojson_path = REPO_ROOT / "data/brewery_data.geojson"

    beers, brewery_urls, unrated_count = load_beer_csv(args.beer_csv)
    style_crosswalk = load_style_crosswalk(args.styles_cross)
    # Validate before any optional geocoding call can consume a credit.
    assign_style_families(beers, style_crosswalk)

    brewery_metadata = load_brewery_csv(args.brewery_csv)
    missing_breweries = sorted(set(beers["Brewery"]) - set(brewery_metadata))
    if missing_breweries:
        raise ValueError(
            "Breweries missing from the brewery CSV: " + ", ".join(missing_breweries)
        )
    summary = build_brewery_summary(beers)
    existing_geojson = load_json(brewery_geojson_path)
    geojson, pending_breweries = update_brewery_geojson(
        existing_geojson, summary, brewery_urls, brewery_metadata, args.skip_geocoding,
    )
    rankings = build_vorb_rankings(summary, geojson)
    brewery_records = build_brewery_records(summary, geojson)
    stage_outputs(
        args.output_root.resolve(),
        beers,
        geojson,
        rankings,
        brewery_records,
        pending_breweries,
        brewery_urls,
        style_crosswalk,
    )

    print(
        f"Built {len(beers)} beers, {len(summary)} breweries, "
        f"{len(rankings)} VORB rankings, and 4 charts."
    )
    if unrated_count:
        print(f"Excluded {unrated_count} beers without a personal rating.")
    if pending_breweries:
        print(
            "Breweries still missing coordinates: " + ", ".join(pending_breweries)
        )


if __name__ == "__main__":
    main()
