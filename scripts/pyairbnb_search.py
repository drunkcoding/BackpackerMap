#!/usr/bin/env python3
import argparse
import json
import sys


def search(url: str, currency: str, language: str, max_results: int) -> list[dict]:
    try:
        import pyairbnb
    except ImportError:
        print(
            "pyairbnb is not installed. Install with: pip install pyairbnb",
            file=sys.stderr,
        )
        sys.exit(2)

    proxy_url = ""
    try:
        hash_value = pyairbnb.fetch_stays_search_hash()
    except Exception:
        hash_value = ""

    raw = pyairbnb.search_all_from_url(
        url, currency=currency, language=language, proxy_url=proxy_url, hash=hash_value
    )

    results: list[dict] = []
    if not isinstance(raw, list):
        return results

    for item in raw[:max_results]:
        if not isinstance(item, dict):
            continue
        coords = item.get("coordinates") or {}
        lat = coords.get("latitude") if isinstance(coords, dict) else None
        lng = coords.get("longitud") if isinstance(coords, dict) else None
        if lng is None and isinstance(coords, dict):
            lng = coords.get("longitude")
        if lat is None or lng is None:
            continue

        price = item.get("price") or {}
        unit = price.get("unit") if isinstance(price, dict) else None
        price_amount = None
        price_label = None
        currency_out = None
        if isinstance(unit, dict):
            price_amount = unit.get("amount")
            currency_out = unit.get("curency_symbol") or unit.get("currency_symbol")
            qualifier = unit.get("qualifier")
            if price_amount is not None:
                price_label = f"{currency_out or ''}{price_amount}{(' / ' + qualifier) if qualifier else ''}".strip()

        photos = item.get("images") or []
        photo_url = None
        if isinstance(photos, list) and len(photos) > 0:
            first = photos[0]
            if isinstance(first, dict):
                photo_url = first.get("url") or first.get("imageUrl")
            elif isinstance(first, str):
                photo_url = first

        rating_obj = item.get("rating") or {}
        rating = rating_obj.get("value") if isinstance(rating_obj, dict) else None
        review_count = rating_obj.get("reviewCount") if isinstance(rating_obj, dict) else None

        results.append(
            {
                "provider": "airbnb",
                "external_id": str(item.get("room_id") or item.get("id") or ""),
                "name": item.get("name") or item.get("title") or "Airbnb listing",
                "url": f"https://www.airbnb.com/rooms/{item.get('room_id')}"
                if item.get("room_id")
                else "",
                "lat": lat,
                "lng": lng,
                "price_label": price_label,
                "price_amount": price_amount,
                "currency": currency_out,
                "photo_url": photo_url,
                "rating": rating,
                "review_count": review_count,
                "raw": item,
            }
        )

    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--currency", default="USD")
    parser.add_argument("--language", default="en")
    parser.add_argument("--max-results", type=int, default=50)
    args = parser.parse_args()

    try:
        results = search(args.url, args.currency, args.language, args.max_results)
    except Exception as e:
        print(f"search failed: {e}", file=sys.stderr)
        return 1

    json.dump(results, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
