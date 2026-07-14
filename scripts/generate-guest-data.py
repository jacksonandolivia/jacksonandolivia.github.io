import csv
import json
from pathlib import Path

CSV_PATH = Path(__file__).parent.parent / 'guest-list.csv'
OUTPUT_PATH = Path(__file__).parent.parent / 'src' / 'data' / 'guests.json'
CONFIG_PATH = Path(__file__).parent.parent / 'src' / 'data' / 'config.json'

guests = []
next_id = 1

with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        last_name = (row.get('LAST NAME') or '').strip()
        first_name = (row.get('FIRST NAME') or '').strip()
        age_group_raw = (row.get('ADULT/CHILD') or '').strip()
        household_id_raw = (row.get('HOUSEHOLD_ID') or '').strip()

        if not household_id_raw:
            continue

        age_group = 'child' if age_group_raw.lower() == 'child' else 'adult'
        household_id = int(household_id_raw)

        display_name = first_name if first_name else 'Guest'

        guests.append({
            'id': next_id,
            'firstName': display_name,
            'lastName': last_name,
            'ageGroup': age_group,
            'householdId': household_id,
        })
        next_id += 1

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_PATH, 'w') as f:
    json.dump(guests, f, indent=2)
print(f'Wrote {len(guests)} guests to {OUTPUT_PATH}')

households = {}
for g in guests:
    households.setdefault(g['householdId'], []).append(g['id'])
print(f'Across {len(households)} households')
