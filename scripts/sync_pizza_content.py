#!/usr/bin/env python3
"""Build the pizza site data from the public Google Sheet and Drive folder."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

import gdown


DEFAULT_SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/"
    "1s-CxCcXWwl7eNvabjsRyxA2YMSR9gXTa1YeRfkHbkt0/gviz/tq?tqx=out:csv"
)
DEFAULT_IMAGE_FOLDER_URL = (
    "https://drive.google.com/drive/folders/"
    "1DwNP_OulqpNbGDaIPpamfKiT3_hBIiux?usp=drive_link"
)
REQUIRED_COLUMNS = {
    "Pizzeria",
    "Style",
    "Rating",
    "Notes",
    "State",
    "Location",
    "Image",
}
USER_AGENT = "pizza-beer-site-sync/1.0"


class SyncError(RuntimeError):
    """Raised when source content cannot safely produce a site deployment."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet-url", default=DEFAULT_SHEET_CSV_URL)
    parser.add_argument("--image-folder-url", default=DEFAULT_IMAGE_FOLDER_URL)
    parser.add_argument(
        "--csv-output",
        type=Path,
        default=Path("data/pizzerias - Pizza.csv"),
    )
    parser.add_argument(
        "--geojson-output",
        type=Path,
        default=Path("data/pizzerias.geojson"),
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=Path("images/Pizza_Images"),
    )
    parser.add_argument(
        "--skip-existing-images",
        action="store_true",
        help="Keep valid local images; useful for a quick local verification.",
    )
    return parser.parse_args()


def fetch_bytes(url: str, timeout: int = 90) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_type()
        return response.read(), content_type


def fetch_sheet(url: str) -> tuple[bytes, list[dict[str, str]]]:
    csv_bytes, content_type = fetch_bytes(url)
    if content_type not in {"text/csv", "text/plain", "application/octet-stream"}:
        raise SyncError(f"Google Sheet returned unexpected content type {content_type!r}")

    try:
        csv_text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise SyncError("Google Sheet CSV is not valid UTF-8") from error

    reader = csv.DictReader(io.StringIO(csv_text))
    columns = set(reader.fieldnames or [])
    missing_columns = sorted(REQUIRED_COLUMNS - columns)
    if missing_columns:
        raise SyncError(
            "Google Sheet is missing required columns: " + ", ".join(missing_columns)
        )

    rows = [row for row in reader if (row.get("Pizzeria") or "").strip()]
    if not rows:
        raise SyncError("Google Sheet contains no pizzeria rows")
    return csv_bytes, rows


def parse_rating(raw_rating: str, row_number: int) -> int | float:
    try:
        rating = float(raw_rating.strip())
    except ValueError as error:
        raise SyncError(f"Row {row_number}: invalid Rating {raw_rating!r}") from error
    if not math.isfinite(rating):
        raise SyncError(f"Row {row_number}: Rating must be finite")
    return int(rating) if rating.is_integer() else rating


def normalize_image_path(raw_path: str, row_number: int) -> str:
    raw_path = raw_path.strip()
    if not raw_path:
        return ""
    path = PurePosixPath(raw_path)
    if path.is_absolute() or ".." in path.parts or len(path.parts) != 2:
        raise SyncError(f"Row {row_number}: invalid Image path {raw_path!r}")
    if path.parts[0] != "Pizza_Images" or not path.name:
        raise SyncError(
            f"Row {row_number}: Image must use Pizza_Images/<filename>"
        )
    return path.as_posix()


def build_geojson(rows: list[dict[str, str]]) -> tuple[dict, set[str]]:
    features = []
    referenced_images: set[str] = set()

    for row_number, row in enumerate(rows, start=2):
        location = (row.get("Location") or "").strip()
        parts = [part.strip() for part in location.split(",")]
        if len(parts) != 2:
            raise SyncError(f"Row {row_number}: invalid Location {location!r}")
        try:
            latitude, longitude = map(float, parts)
        except ValueError as error:
            raise SyncError(
                f"Row {row_number}: Location must contain numeric latitude, longitude"
            ) from error
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise SyncError(f"Row {row_number}: Location is outside valid bounds")

        image_path = normalize_image_path(row.get("Image") or "", row_number)
        if image_path:
            referenced_images.add(PurePosixPath(image_path).name)

        properties = {
            "Pizzeria": (row.get("Pizzeria") or "").strip(),
            "Style": (row.get("Style") or "").strip(),
            "State": (row.get("State") or "").strip(),
            "Rating": parse_rating(row.get("Rating") or "", row_number),
            "Notes": (row.get("Notes") or "").strip(),
            "Image": image_path,
        }
        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        )

    features.sort(
        key=lambda feature: (
            -float(feature["properties"]["Rating"]),
            feature["properties"]["Pizzeria"].casefold(),
        )
    )
    return {"type": "FeatureCollection", "features": features}, referenced_images


def list_drive_images(folder_url: str) -> dict[str, str]:
    try:
        entries = gdown.download_folder(
            url=folder_url,
            quiet=True,
            use_cookies=False,
            skip_download=True,
        )
    except Exception as error:
        raise SyncError("Could not list the public Google Drive image folder") from error

    images: dict[str, str] = {}
    for entry in entries:
        filename = PurePosixPath(entry.path).name
        if filename in images:
            raise SyncError(f"Google Drive contains duplicate image name {filename!r}")
        images[filename] = entry.id
    return images


def looks_like_image(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 12:
        return False
    with path.open("rb") as image_file:
        header = image_file.read(12)
    return (
        header.startswith(b"\xff\xd8\xff")
        or header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith((b"GIF87a", b"GIF89a"))
        or (header.startswith(b"RIFF") and header[8:12] == b"WEBP")
    )


def download_drive_image(file_id: str, destination: Path) -> None:
    query = urllib.parse.urlencode(
        {"id": file_id, "export": "download", "confirm": "t"}
    )
    url = f"https://drive.usercontent.google.com/download?{query}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".download", dir=destination.parent
    )
    os.close(file_descriptor)
    temp_path = Path(temp_name)

    try:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=90) as response:
            with temp_path.open("wb") as output_file:
                while chunk := response.read(1024 * 1024):
                    output_file.write(chunk)
        if not looks_like_image(temp_path):
            raise SyncError(f"Drive returned a non-image response for {destination.name}")
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


def sync_images(
    referenced_images: set[str],
    drive_images: dict[str, str],
    images_dir: Path,
    skip_existing: bool,
) -> tuple[int, list[str]]:
    missing_from_drive = sorted(referenced_images - set(drive_images))
    if missing_from_drive:
        raise SyncError(
            "Sheet references images missing from Drive: " + ", ".join(missing_from_drive)
        )

    downloaded = 0
    fallback_warnings: list[str] = []
    total = len(referenced_images)
    for index, filename in enumerate(sorted(referenced_images), start=1):
        destination = images_dir / filename
        if skip_existing and looks_like_image(destination):
            continue

        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                download_drive_image(drive_images[filename], destination)
                downloaded += 1
                last_error = None
                break
            except Exception as error:
                last_error = error
                if attempt < 3:
                    time.sleep(2**attempt)

        if last_error is not None:
            if looks_like_image(destination):
                fallback_warnings.append(filename)
            else:
                raise SyncError(
                    f"Could not download required image {filename!r} and no valid local "
                    "fallback exists"
                ) from last_error

        if index % 20 == 0 or index == total:
            print(f"Checked {index}/{total} referenced images")

    return downloaded, fallback_warnings


def atomic_write_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(file_descriptor, "wb") as output_file:
            output_file.write(content)
        os.replace(temp_name, path)
    finally:
        Path(temp_name).unlink(missing_ok=True)


def main() -> None:
    args = parse_args()
    csv_bytes, rows = fetch_sheet(args.sheet_url)
    geojson, referenced_images = build_geojson(rows)
    drive_images = list_drive_images(args.image_folder_url)
    downloaded, fallback_warnings = sync_images(
        referenced_images,
        drive_images,
        args.images_dir,
        args.skip_existing_images,
    )

    atomic_write_bytes(args.csv_output, csv_bytes)
    geojson_bytes = (
        json.dumps(geojson, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    )
    atomic_write_bytes(args.geojson_output, geojson_bytes)

    print(
        f"Built {len(geojson['features'])} pizzerias with "
        f"{len(referenced_images)} referenced images ({downloaded} downloaded)."
    )
    if fallback_warnings:
        print(
            "Drive did not return these files; kept valid repository copies: "
            + ", ".join(fallback_warnings)
        )


if __name__ == "__main__":
    try:
        main()
    except SyncError as error:
        raise SystemExit(f"Pizza content sync failed: {error}") from error
