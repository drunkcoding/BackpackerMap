#!/usr/bin/env python3
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--currency", default="USD")
    parser.add_argument("--language", default="en")
    parser.add_argument("--max-results", type=int, default=50)
    args = parser.parse_args()

    behaviour = os.environ.get("MOCK_PYAIRBNB_SEARCH_BEHAVIOUR", "ok")
    if behaviour == "fail":
        print("simulated search failure", file=sys.stderr)
        return 1
    if behaviour == "empty":
        json.dump([], sys.stdout)
        sys.stdout.write("\n")
        return 0
    if behaviour == "sleep":
        import time

        time.sleep(60)
        return 0

    payload = [
        {
            "provider": "airbnb",
            "external_id": f"mock-{i}",
            "name": f"Mock cabin {i}",
            "url": f"https://www.airbnb.com/rooms/mock-{i}",
            "lat": 57.0 + i * 0.01,
            "lng": -3.8 + i * 0.01,
            "price_label": f"£{100 + i * 20} / night",
            "price_amount": 100 + i * 20,
            "currency": "GBP",
            "photo_url": f"https://example.com/photo-{i}.jpg",
            "rating": 4.5,
            "review_count": 100 + i,
            "raw": {"url_passed": args.url},
        }
        for i in range(min(args.max_results, 5))
    ]
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
