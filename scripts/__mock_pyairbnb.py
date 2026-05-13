#!/usr/bin/env python3
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    behaviour = os.environ.get("MOCK_PYAIRBNB_BEHAVIOUR", "ok")

    if behaviour == "fail":
        print("simulated failure", file=sys.stderr)
        return 1

    if behaviour == "sleep":
        import time

        time.sleep(60)
        return 0

    listing_id = args.url.rstrip("/").split("/")[-1]
    payload = {
        "lat": 56.7867,
        "lng": -5.0035,
        "price_label": "$120 / night",
        "photo": f"https://example.com/{listing_id}.jpg",
        "name": f"Mock cabin {listing_id}",
    }
    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
