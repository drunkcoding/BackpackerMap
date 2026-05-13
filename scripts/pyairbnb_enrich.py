#!/usr/bin/env python3
import argparse
import json
import sys


def enrich(url: str) -> dict:
    try:
        import pyairbnb
    except ImportError:
        print(
            "pyairbnb is not installed. Install with: pip install pyairbnb",
            file=sys.stderr,
        )
        sys.exit(2)

    details = pyairbnb.get_details(room_url=url, currency="USD", adults=2)

    coords = details.get("coordinates") or details.get("location") or {}
    lat = coords.get("latitude") if isinstance(coords, dict) else None
    lng = coords.get("longitude") if isinstance(coords, dict) else None

    price = details.get("price") or details.get("pricePerNight") or None
    if isinstance(price, dict):
        price_label = price.get("label") or price.get("nightlyPrice") or None
    else:
        price_label = str(price) if price is not None else None

    photos = details.get("images") or details.get("photos") or []
    photo = None
    if isinstance(photos, list) and len(photos) > 0:
        first = photos[0]
        if isinstance(first, dict):
            photo = first.get("imageUrl") or first.get("url")
        elif isinstance(first, str):
            photo = first

    return {
        "lat": lat,
        "lng": lng,
        "price_label": price_label,
        "photo": photo,
        "name": details.get("name") or details.get("title"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    try:
        result = enrich(args.url)
    except Exception as e:
        print(f"enrich failed: {e}", file=sys.stderr)
        return 1

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
