#!/usr/bin/env python3
"""Poll the RSVP admin API and export the latest responses as CSV."""

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

FIELDNAMES = [
    "Household ID",
    "Submitted At",
    "Guest ID",
    "First Name",
    "Last Name",
    "Age Group",
    "Attending",
    "Meal",
    "Dietary Restrictions",
    "Email",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Poll the RSVP API and write all responses to a CSV file."
    )
    parser.add_argument(
        "--api-base-url",
        default=os.environ.get("API_BASE_URL"),
        help="Azure Functions base URL (or set API_BASE_URL).",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("SITE_PASSWORD"),
        help="Plaintext site password (or set SITE_PASSWORD).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("rsvp-export.csv"),
        help="CSV output path (default: rsvp-export.csv).",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=60,
        help="Seconds between checks (default: 60).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Fetch and export once, then exit.",
    )
    parser.add_argument(
        "--timestamped",
        action="store_true",
        help="Write each changed export to a new UTC-timestamped CSV file.",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    missing = []
    if not args.api_base_url:
        missing.append("--api-base-url or API_BASE_URL")
    if not args.password:
        missing.append("--password or SITE_PASSWORD")
    if missing:
        raise SystemExit("Missing required configuration: " + ", ".join(missing))
    if args.interval <= 0:
        raise SystemExit("--interval must be greater than zero")


def fetch_rsvps(api_base_url: str, password: str) -> list[dict[str, Any]]:
    url = api_base_url.rstrip("/") + "/api/list-rsvps"
    request = urllib.request.Request(url, headers={"x-admin-password": password})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not payload.get("ok") or not isinstance(payload.get("rsvps"), list):
        raise RuntimeError(payload.get("error", "The API returned an invalid response."))
    return payload["rsvps"]


def response_signature(rsvps: list[dict[str, Any]]) -> str:
    serialized = json.dumps(rsvps, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def csv_rows(rsvps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for rsvp in sorted(rsvps, key=lambda item: item.get("householdId", 0)):
        for guest in rsvp.get("guests", []):
            rows.append(
                {
                    "Household ID": rsvp.get("householdId", ""),
                    "Submitted At": rsvp.get("submittedAt", ""),
                    "Guest ID": guest.get("guestId", ""),
                    "First Name": guest.get("firstName", ""),
                    "Last Name": guest.get("lastName", ""),
                    "Age Group": guest.get("ageGroup", ""),
                    "Attending": "Yes" if guest.get("attending") else "No",
                    "Meal": guest.get("meal") or "",
                    "Dietary Restrictions": guest.get("dietaryRestrictions") or "",
                    "Email": guest.get("email") or "",
                }
            )
    return rows


def write_csv(output: Path, rsvps: list[dict[str, Any]]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(csv_rows(rsvps))


def timestamped_path(output: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return output.with_name(f"{output.stem}-{timestamp}{output.suffix}")


def main() -> int:
    args = parse_args()
    validate_args(args)
    previous_signature = None

    while True:
        try:
            rsvps = fetch_rsvps(args.api_base_url, args.password)
            signature = response_signature(rsvps)
            if signature != previous_signature:
                output = timestamped_path(args.output) if args.timestamped else args.output
                write_csv(output, rsvps)
                previous_signature = signature
                print(
                    f"Exported {len(rsvps)} household response(s) to {output}",
                    flush=True,
                )
            else:
                print("No RSVP updates found.", flush=True)
        except (urllib.error.URLError, ValueError, RuntimeError) as error:
            print(f"RSVP check failed: {error}", file=sys.stderr, flush=True)
            if args.once:
                return 1

        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())