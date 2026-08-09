"""
Security & Auth API tests for the wedding RSVP site.

Usage:
    # Set required env vars:
    export SITE_PASSWORD="the-actual-site-password"
    export ADMIN_PASSWORD="the-actual-admin-password"

    # Optionally override the API URL (default: from data/config.json)
    export API_BASE_URL="https://wedding-rsvp-api-bbuoyk3ezmdfs.azurewebsites.net"

    # Run tests:
    python -m pytest test_security_auth.py -v

    # With verbose curl-like output:
    python -m pytest test_security_auth.py -v -s
"""

import json
import os
import pytest
import requests

# ── Configuration ──────────────────────────────────────────────────────────────

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "config.json")
with open(CONFIG_PATH) as f:
    CONFIG = json.load(f)

API_BASE = os.environ.get("API_BASE_URL") or CONFIG["apiBaseUrl"]
SUBMIT_RSVP_URL = f"{API_BASE}/api/submit-rsvp"
LIST_RSVPS_URL = f"{API_BASE}/api/list-rsvps"
GET_RSVP_URL = f"{API_BASE}/api/get-rsvp"
VERIFY_PASSWORD_URL = f"{API_BASE}/api/verify-password"

SITE_PASSWORD = os.environ.get("SITE_PASSWORD")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

# A valid payload for submit-rsvp tests (household 1: Chris & Carolyn Wikle)
VALID_PAYLOAD = {
    "householdId": 1,
    "guests": [
        {
            "guestId": 1,
            "firstName": "Chris",
            "lastName": "Wikle",
            "ageGroup": "adult",
            "attending": True,
            "meal": "chicken",
            "dietaryRestrictions": "",
        },
        {
            "guestId": 2,
            "firstName": "Carolyn",
            "lastName": "Wikle",
            "ageGroup": "adult",
            "attending": True,
            "meal": "fish",
            "dietaryRestrictions": "No garlic",
        },
    ],
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def skip_if_no_site_password():
    if not SITE_PASSWORD:
        pytest.skip("SITE_PASSWORD env var not set")

def skip_if_no_admin_password():
    if not ADMIN_PASSWORD:
        pytest.skip("ADMIN_PASSWORD env var not set")


# ── submit-rsvp — Password Auth ───────────────────────────────────────────────

class TestSubmitRSVPAuth:
    def test_no_password_in_body(self):
        """POST /api/submit-rsvp without sitePassword → 401"""
        payload = {**VALID_PAYLOAD}
        payload.pop("sitePassword", None)
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 401
        body = resp.json()
        assert body.get("ok") is False
        assert "password" in body.get("error", "").lower()

    def test_empty_password(self):
        """POST /api/submit-rsvp with empty sitePassword → 401"""
        payload = {**VALID_PAYLOAD, "sitePassword": ""}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_null_password(self):
        """POST /api/submit-rsvp with null sitePassword → 401"""
        payload = {**VALID_PAYLOAD, "sitePassword": None}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_incorrect_password(self):
        """POST /api/submit-rsvp with wrong sitePassword → 401"""
        payload = {**VALID_PAYLOAD, "sitePassword": "wrong-password-12345"}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_correct_password_succeeds(self):
        """POST /api/submit-rsvp with the correct sitePassword → 201"""
        skip_if_no_site_password()
        payload = {**VALID_PAYLOAD, "sitePassword": SITE_PASSWORD}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        # Allow 201 (new) or the upsert path also works
        assert resp.status_code in (201, 200)
        assert resp.json().get("ok") is True


# ── submit-rsvp — Request Validation ──────────────────────────────────────────

class TestSubmitRSVPValidation:
    def test_non_json_body(self):
        """POST /api/submit-rsvp with non-JSON body → 400"""
        skip_if_no_site_password()
        resp = requests.post(
            SUBMIT_RSVP_URL,
            data="not-json",
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 400

    def test_missing_household_id(self):
        """POST /api/submit-rsvp without householdId → 400"""
        skip_if_no_site_password()
        payload = {"sitePassword": SITE_PASSWORD, "guests": VALID_PAYLOAD["guests"]}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "householdId" in resp.json().get("error", "")

    def test_string_household_id(self):
        """POST /api/submit-rsvp with string householdId → 400 (must be number)"""
        skip_if_no_site_password()
        payload = {**VALID_PAYLOAD, "sitePassword": SITE_PASSWORD, "householdId": "1"}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "householdId" in resp.json().get("error", "")

    def test_empty_guests_array(self):
        """POST /api/submit-rsvp with empty guests array → 400"""
        skip_if_no_site_password()
        payload = {**VALID_PAYLOAD, "sitePassword": SITE_PASSWORD, "guests": []}
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "guests" in resp.json().get("error", "")

    def test_missing_guest_id(self):
        """POST /api/submit-rsvp with missing guestId → 400"""
        skip_if_no_site_password()
        payload = {
            **VALID_PAYLOAD,
            "sitePassword": SITE_PASSWORD,
            "guests": [{"firstName": "NoId", "lastName": "Test", "attending": False}],
        }
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "guestId" in resp.json().get("error", "")

    def test_non_boolean_attending(self):
        """POST /api/submit-rsvp with string 'true' for attending → 400"""
        skip_if_no_site_password()
        payload = {
            **VALID_PAYLOAD,
            "sitePassword": SITE_PASSWORD,
            "guests": [{"guestId": 99, "firstName": "Bad", "lastName": "Data", "attending": "true"}],
        }
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "attending" in resp.json().get("error", "")

    def test_attending_without_meal(self):
        """POST /api/submit-rsvp with attending=true but no meal → 400"""
        skip_if_no_site_password()
        payload = {
            **VALID_PAYLOAD,
            "sitePassword": SITE_PASSWORD,
            "guests": [{"guestId": 99, "firstName": "Hungry", "lastName": "Guest", "attending": True}],
        }
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "meal" in resp.json().get("error", "")

    def test_invalid_meal_value(self):
        """POST /api/submit-rsvp with invalid meal value → 400"""
        skip_if_no_site_password()
        payload = {
            **VALID_PAYLOAD,
            "sitePassword": SITE_PASSWORD,
            "guests": [{
                "guestId": 99, "firstName": "Picky", "lastName": "Eater",
                "attending": True, "meal": "vegan-gluten-free",
            }],
        }
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code == 400
        assert "meal" in resp.json().get("error", "")

    def test_not_attending_no_meal_ok(self):
        """POST /api/submit-rsvp with attending=false and no meal → 201"""
        skip_if_no_site_password()
        payload = {
            "sitePassword": SITE_PASSWORD,
            "householdId": 9999,
            "guests": [{
                "guestId": 999, "firstName": "Not", "lastName": "Coming",
                "ageGroup": "adult", "attending": False,
            }],
        }
        resp = requests.post(SUBMIT_RSVP_URL, json=payload)
        assert resp.status_code in (201, 200)
        assert resp.json().get("ok") is True


# ── list-rsvps — Auth via x-admin-password header ─────────────────────────────

class TestListRSVPsAuth:
    def test_no_header(self):
        """GET /api/list-rsvps without x-admin-password → 401"""
        resp = requests.get(LIST_RSVPS_URL)
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_wrong_header(self):
        """GET /api/list-rsvps with wrong x-admin-password → 401"""
        resp = requests.get(LIST_RSVPS_URL, headers={"x-admin-password": "wrong-password"})
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_empty_header(self):
        """GET /api/list-rsvps with empty x-admin-password → 401"""
        resp = requests.get(LIST_RSVPS_URL, headers={"x-admin-password": ""})
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_correct_header_succeeds(self):
        """GET /api/list-rsvps with correct site password (NOT admin password) → 200

        NOTE: The server compares x-admin-password against process.env.SITE_PASSWORD,
        NOT admin password. So you must pass the site password as the admin header.
        """
        skip_if_no_site_password()
        resp = requests.get(LIST_RSVPS_URL, headers={"x-admin-password": SITE_PASSWORD})
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("ok") is True
        assert "rsvps" in body
        assert isinstance(body["rsvps"], list)


# ── get-rsvp — No Auth Required ───────────────────────────────────────────────

class TestGetRSVP:
    def test_no_auth_required(self):
        """GET /api/get-rsvp?householdId=1 → 200 (no auth needed, security concern)"""
        resp = requests.get(GET_RSVP_URL, params={"householdId": 1})
        # Could be 200 (found) or 404 (not submitted yet)
        assert resp.status_code in (200, 404)
        body = resp.json()
        assert "ok" in body

    def test_missing_household_id(self):
        """GET /api/get-rsvp without householdId → 400"""
        resp = requests.get(GET_RSVP_URL)
        assert resp.status_code == 400
        assert "householdId" in resp.json().get("error", "")

    def test_non_numeric_household_id(self):
        """GET /api/get-rsvp?householdId=abc → 400"""
        resp = requests.get(GET_RSVP_URL, params={"householdId": "abc"})
        assert resp.status_code == 400
        assert "householdId" in resp.json().get("error", "")

    def test_nonexistent_household(self):
        """GET /api/get-rsvp?householdId=99999 → 200 or 404 (can't guarantee non-existence)"""
        resp = requests.get(GET_RSVP_URL, params={"householdId": 99999})
        assert resp.status_code in (200, 404)


# ── verify-password — Dead Code Endpoint ──────────────────────────────────────

class TestVerifyPassword:
    def test_no_password(self):
        """POST /api/verify-password without password → 400"""
        resp = requests.post(VERIFY_PASSWORD_URL, json={})
        assert resp.status_code == 400

    def test_incorrect_password(self):
        """POST /api/verify-password with wrong password → 401"""
        resp = requests.post(VERIFY_PASSWORD_URL, json={"password": "wrong"})
        assert resp.status_code == 401
        assert resp.json().get("ok") is False

    def test_correct_password(self):
        """POST /api/verify-password with correct password → 200"""
        skip_if_no_site_password()
        resp = requests.post(VERIFY_PASSWORD_URL, json={"password": SITE_PASSWORD})
        assert resp.status_code == 200
        assert resp.json().get("ok") is True


# ── Overall Security Observations (printed in verbose mode) ───────────────────

@pytest.fixture(autouse=True, scope="session")
def print_security_notes():
    notes = [
        "\n── Security Observations ──",
        f"  API under test: {API_BASE}",
        "  1. get-rsvp has NO authentication — any household's RSVP is readable",
        "     with just the householdId.",
        "  2. list-rsvps uses SITE password, not ADMIN password, as the",
        "     x-admin-password header (unusual naming).",
        "  3. verify-password endpoint exists but is never called by the",
        "     frontend (dead code).",
        "  4. No rate limiting, CSRF protection, or request throttling on",
        "     any endpoint.",
        "",
    ]
    yield
    for line in notes:
        print(line)
