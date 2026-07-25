import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "sync_untappd_content", ROOT / "scripts/sync_untappd_content.py"
)
SYNC = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(SYNC)


class UntappdSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.beers, cls.brewery_urls, cls.unrated_count = SYNC.load_beer_csv(
            ROOT / "inputs/beer_data.csv"
        )
        cls.brewery_metadata = SYNC.load_brewery_csv(ROOT / "inputs/brewery_data.csv")
        cls.geojson = SYNC.load_json(ROOT / "data/brewery_data.geojson")
        cls.style_crosswalk = SYNC.load_style_crosswalk(
            ROOT / "inputs/styles_cross.xlsx"
        )

    def test_csv_inputs_are_clean_and_complete(self):
        self.assertGreater(len(self.beers), 0)
        self.assertGreater(self.beers["Brewery"].nunique(), 0)
        self.assertGreaterEqual(self.unrated_count, 0)
        self.assertFalse(self.beers[["My Rating", "Untappd Rating"]].isna().any().any())
        self.assertEqual(set(self.beers["Brewery"]), set(self.brewery_urls))
        self.assertEqual(set(self.beers["Brewery"]) - set(self.brewery_metadata), set())

    def test_drive_refresh_validates_both_files_before_replacing_inputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            beer_path = Path(temp_dir) / "beer.csv"
            brewery_path = Path(temp_dir) / "brewery.csv"
            beer_path.write_bytes(b"old beer input\n")
            brewery_path.write_bytes(b"old brewery input\n")
            beer_bytes = (ROOT / "inputs/beer_data.csv").read_bytes()

            with patch.object(
                SYNC,
                "fetch_drive_csv",
                side_effect=[beer_bytes, b"not,the,brewery,csv\n1,2,3,4\n"],
            ):
                with self.assertRaisesRegex(ValueError, "brewery CSV is missing"):
                    SYNC.refresh_inputs_from_drive(
                        "beer-file", "brewery-file", beer_path, brewery_path
                    )

            self.assertEqual(beer_path.read_bytes(), b"old beer input\n")
            self.assertEqual(brewery_path.read_bytes(), b"old brewery input\n")

    def test_drive_refresh_atomically_updates_valid_inputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            beer_path = Path(temp_dir) / "beer.csv"
            brewery_path = Path(temp_dir) / "brewery.csv"
            beer_bytes = (ROOT / "inputs/beer_data.csv").read_bytes()
            brewery_bytes = (ROOT / "inputs/brewery_data.csv").read_bytes()

            with patch.object(
                SYNC,
                "fetch_drive_csv",
                side_effect=[beer_bytes, brewery_bytes],
            ):
                changed = SYNC.refresh_inputs_from_drive(
                    "beer-file", "brewery-file", beer_path, brewery_path
                )

            self.assertEqual(changed, [beer_path, brewery_path])
            self.assertEqual(beer_path.read_bytes(), beer_bytes)
            self.assertEqual(brewery_path.read_bytes(), brewery_bytes)

    def test_brewery_csv_strips_source_name_whitespace(self):
        self.assertIn("Messorem", self.brewery_metadata)
        self.assertIn("Utica Club", self.brewery_metadata)
        self.assertNotIn("Messorem ", self.brewery_metadata)
        self.assertEqual(
            self.brewery_metadata["Messorem"]["full_address"],
            "2233 Rue Pitt, Montreal Canada, QC",
        )

    def test_current_vorb_output_is_reproduced_exactly(self):
        summary = SYNC.build_brewery_summary(self.beers)
        geojson, pending = SYNC.update_brewery_geojson(
            self.geojson,
            summary,
            self.brewery_urls,
            self.brewery_metadata,
            skip_geocoding=True,
        )
        actual = SYNC.build_vorb_rankings(summary, geojson)
        expected = json.loads((ROOT / "data/VORB_data.json").read_text())
        actual_by_brewery = {row["Brewery"]: row for row in actual}
        expected_by_brewery = {row["Brewery"]: row for row in expected}
        self.assertEqual(actual_by_brewery, expected_by_brewery)
        self.assertIsInstance(pending, list)

    def test_style_crosswalk_covers_updated_beer_csv(self):
        styled = SYNC.assign_style_families(self.beers, self.style_crosswalk)
        self.assertFalse(styled["Style Family"].isna().any())
        self.assertFalse(styled["Style Family"].eq("").any())
        dwell = styled.loc[styled["Beer"] == "Dwell (Batch 1)", "Style Family"]
        if not dwell.empty:
            self.assertTrue(dwell.eq("Sours+Farmhouse+Wild").all())

    def test_unknown_style_must_be_added_to_crosswalk(self):
        beer = self.beers.iloc[[0]].copy()
        beer["Style"] = "Entirely New Untappd Style"
        with self.assertRaisesRegex(ValueError, "Entirely New Untappd Style"):
            SYNC.assign_style_families(beer, self.style_crosswalk)

    def test_style_vorb_rankings_are_sorted_and_finite(self):
        for family in ["IPAs+", "Lagers+"]:
            ranking = SYNC.style_vorb(self.beers, family, self.style_crosswalk)
            self.assertGreater(len(ranking), 0)
            self.assertTrue(ranking["VORB"].notna().all())
            self.assertTrue(ranking["VORB"].is_monotonic_decreasing)
            self.assertTrue(
                ranking["beers_rated"].ge(SYNC.MIN_STYLE_BEERS_FOR_VORB).all()
            )

    def test_only_new_breweries_remain_pending(self):
        summary = SYNC.build_brewery_summary(self.beers)
        geojson, pending = SYNC.update_brewery_geojson(
            self.geojson,
            summary,
            self.brewery_urls,
            self.brewery_metadata,
            skip_geocoding=True,
        )
        names = [
            feature["properties"]["Brewery Name"] for feature in geojson["features"]
        ]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(set(names), set(self.beers["Brewery"]))
        expected_pending = {
            feature["properties"]["Brewery Name"]
            for feature in geojson["features"]
            if not SYNC.valid_geometry(feature.get("geometry"))
        }
        self.assertEqual(set(pending), expected_pending)

        renamed = {
            "Burlington Beer Co.",
            "Fidens Brewing Co.",
            "Heineken Italia",
            "Hubbard’s Cave",
            "Lawson’s Finest Liquids",
            "Modestman Brewing",
            "Rekˈ·lis Brewing Company",
            "Three Notch’d Brewing Company",
            "Zero Gravity Beer",
        }
        self.assertTrue(renamed.isdisjoint(pending))
        feature_by_name = {
            feature["properties"]["Brewery Name"]: feature
            for feature in geojson["features"]
        }
        self.assertTrue(
            all(
                SYNC.valid_geometry(feature_by_name[name]["geometry"])
                for name in renamed.intersection(feature_by_name)
            )
        )

    def test_geocoding_is_called_only_for_a_brewery_missing_coordinates(self):
        existing_beer = self.beers[
            self.beers["Brewery"] == "Hill Farmstead Brewery"
        ].iloc[[0]]
        new_beer = existing_beer.copy()
        new_beer["Beer"] = "New Brewery Test Beer"
        new_beer["Brewery"] = "New Brewery Test"
        beers = SYNC.clean_beers(
            pd.concat([existing_beer, new_beer], ignore_index=True)
        )
        summary = SYNC.build_brewery_summary(beers)
        existing_feature = next(
            feature
            for feature in self.geojson["features"]
            if feature["properties"]["Brewery Name"] == "Hill Farmstead Brewery"
        )
        geojson = {"type": "FeatureCollection", "features": [existing_feature]}
        metadata = {
            "New Brewery Test": {
                "Brewery Name": "New Brewery Test",
                "full_address": "1 Main St, Richmond, VA",
            }
        }
        geocode_result = (
            {"type": "Point", "coordinates": [-77.43, 37.54]},
            {
                "Latitude": 37.54,
                "Longitude": -77.43,
                "City": "Richmond",
                "State": "VA",
                "Country": "United States",
            },
        )

        with patch.dict(
            SYNC.os.environ, {"GEOAPIFY_API_KEY": "test-key"}
        ), patch.object(
            SYNC, "geocode_geoapify", return_value=geocode_result
        ) as geocode:
            updated, pending = SYNC.update_brewery_geojson(
                geojson,
                summary,
                {"New Brewery Test": "https://untappd.com/NewBreweryTest"},
                metadata,
                skip_geocoding=False,
            )

        geocode.assert_called_once_with("1 Main St, Richmond, VA", "test-key")
        self.assertEqual(pending, [])
        hill_feature = next(
            feature
            for feature in updated["features"]
            if feature["properties"]["Brewery Name"] == "Hill Farmstead Brewery"
        )
        self.assertEqual(hill_feature["geometry"], existing_feature["geometry"])

    def test_existing_pending_brewery_is_geocoded_once(self):
        beer = self.beers[
            self.beers["Brewery"] == "Hill Farmstead Brewery"
        ].iloc[[0]].copy()
        beer["Beer"] = "Pending Brewery Test Beer"
        beer["Brewery"] = "Pending Brewery Test"
        summary = SYNC.build_brewery_summary(SYNC.clean_beers(beer))
        pending_feature = {
            "type": "Feature",
            "properties": {
                "Brewery Name": "Pending Brewery Test",
                "full_address": "1 Main St, Richmond, VA",
                "Geocoding Status": "pending",
            },
            "geometry": None,
        }
        metadata = {
            "Pending Brewery Test": {
                "Brewery Name": "Pending Brewery Test",
                "full_address": "1 Main St, Richmond, VA",
                "City": "Richmond",
                "State": "Virginia",
            }
        }
        geocode_result = (
            {"type": "Point", "coordinates": [-77.43, 37.54]},
            {
                "Latitude": 37.54,
                "Longitude": -77.43,
                "City": "Richmond",
                "State": "VA",
                "Country": "United States",
            },
        )

        with patch.dict(
            SYNC.os.environ, {"GEOAPIFY_API_KEY": "test-key"}
        ), patch.object(
            SYNC, "geocode_geoapify", return_value=geocode_result
        ) as geocode:
            updated, pending = SYNC.update_brewery_geojson(
                {"type": "FeatureCollection", "features": [pending_feature]},
                summary,
                {},
                metadata,
                skip_geocoding=False,
            )

        geocode.assert_called_once_with("1 Main St, Richmond, VA", "test-key")
        self.assertEqual(pending, [])
        properties = updated["features"][0]["properties"]
        self.assertEqual(properties["State"], "Virginia")
        self.assertEqual(properties["Country"], "United States")

        before_second_pass = copy.deepcopy(updated)
        with patch.object(SYNC, "geocode_geoapify") as geocode:
            repeated, pending = SYNC.update_brewery_geojson(
                copy.deepcopy(updated),
                summary,
                {},
                metadata,
                skip_geocoding=False,
            )

        geocode.assert_not_called()
        self.assertEqual(pending, [])
        self.assertEqual(repeated, before_second_pass)

    def test_geoapify_geocoder_parses_response(self):
        payload = {
            "results": [
                {
                    "lon": -77.43,
                    "lat": 37.54,
                    "city": "Richmond",
                    "state_code": "VA",
                    "country": "United States",
                }
            ],
        }

        with patch.object(SYNC.requests, "get") as request:
            request.return_value.json.return_value = payload
            geometry, properties = SYNC.geocode_geoapify(
                "1 Main St, Richmond, VA", "test-key"
            )

        request.return_value.raise_for_status.assert_called_once_with()
        request_params = request.call_args.kwargs["params"]
        self.assertEqual(request_params["apiKey"], "test-key")
        self.assertEqual(geometry["coordinates"], [-77.43, 37.54])
        self.assertEqual(properties["City"], "Richmond")
        self.assertEqual(properties["State"], "VA")
        self.assertEqual(properties["Country"], "United States")

    def test_geocoding_http_errors_do_not_expose_the_api_key(self):
        response = requests.Response()
        response.status_code = 401
        error = requests.HTTPError(
            "401 for https://example.invalid/?key=top-secret", response=response
        )
        message = SYNC.geocoding_error_message(error)
        self.assertEqual(message, "Geoapify geocoding returned HTTP 401")
        self.assertNotIn("top-secret", message)

    def test_failed_geocode_is_not_retried_until_its_address_changes(self):
        beer = self.beers[
            self.beers["Brewery"] == "Hill Farmstead Brewery"
        ].iloc[[0]].copy()
        beer["Beer"] = "Failed Geocode Test Beer"
        beer["Brewery"] = "Failed Geocode Test"
        summary = SYNC.build_brewery_summary(SYNC.clean_beers(beer))
        failed_feature = {
            "type": "Feature",
            "properties": {
                "Brewery Name": "Failed Geocode Test",
                "full_address": "1 Bad Address, Richmond, VA",
                "Geocoding Status": "failed",
                "Geocoding Error": "No result",
            },
            "geometry": None,
        }
        metadata = {
            "Failed Geocode Test": {
                "Brewery Name": "Failed Geocode Test",
                "full_address": "1 Bad Address, Richmond, VA",
            }
        }

        with patch.dict(
            SYNC.os.environ, {"GEOAPIFY_API_KEY": "test-key"}
        ), patch.object(SYNC, "geocode_geoapify") as geocode:
            _, pending = SYNC.update_brewery_geojson(
                {"type": "FeatureCollection", "features": [failed_feature]},
                summary,
                {},
                metadata,
                skip_geocoding=False,
            )

        geocode.assert_not_called()
        self.assertEqual(pending, ["Failed Geocode Test"])

        changed_metadata = {
            "Failed Geocode Test": {
                "Brewery Name": "Failed Geocode Test",
                "full_address": "2 Corrected Address, Richmond, VA",
            }
        }
        geocode_result = (
            {"type": "Point", "coordinates": [-77.43, 37.54]},
            {
                "Latitude": 37.54,
                "Longitude": -77.43,
                "City": "Richmond",
                "State": "VA",
                "Country": "United States",
            },
        )
        with patch.dict(
            SYNC.os.environ, {"GEOAPIFY_API_KEY": "test-key"}
        ), patch.object(
            SYNC, "geocode_geoapify", return_value=geocode_result
        ) as geocode:
            _, pending = SYNC.update_brewery_geojson(
                {"type": "FeatureCollection", "features": [failed_feature]},
                summary,
                {},
                changed_metadata,
                skip_geocoding=False,
            )

        geocode.assert_called_once_with(
            "2 Corrected Address, Richmond, VA", "test-key"
        )
        self.assertEqual(pending, [])


if __name__ == "__main__":
    unittest.main()
