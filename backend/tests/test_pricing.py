"""Tests for the pricing module and its Flask endpoints."""

import pytest

from pricing import load_pricing
from pricing import save_model_pricing


@pytest.fixture()
def pricing_file(tmp_path, monkeypatch):
    """Point the pricing module at a pricing.json under a temp dir, not the real home."""
    fake_file = tmp_path / ".claude-memory-manager" / "pricing.json"
    monkeypatch.setattr("pricing._PRICING_FILE", fake_file)
    return fake_file


class TestLoadPricing:
    def test_returns_empty_dict_when_file_missing(self, pricing_file):
        assert load_pricing() == {}


class TestSaveModelPricing:
    def test_round_trips_rates(self, pricing_file):
        rates = {
            "baseInputRate": 3.0,
            "fiveMinWriteRate": 3.75,
            "oneHourWriteRate": 6.0,
            "cacheReadRate": 0.3,
            "outputRate": 15.0,
        }
        save_model_pricing("claude-sonnet-4-5-20250929", rates)
        assert load_pricing() == {"claude-sonnet-4-5-20250929": rates}


class TestPricingEndpoints:
    def test_put_then_get_returns_saved_rates(self, client, pricing_file):
        rates = {
            "baseInputRate": 3.0,
            "fiveMinWriteRate": 3.75,
            "oneHourWriteRate": 6.0,
            "cacheReadRate": 0.3,
            "outputRate": 15.0,
        }
        put_resp = client.put("/api/pricing/claude-sonnet-4-5-20250929", json=rates)
        assert put_resp.status_code == 200
        assert put_resp.get_json() == {"claude-sonnet-4-5-20250929": rates}

        get_resp = client.get("/api/pricing")
        assert get_resp.status_code == 200
        assert get_resp.get_json() == {"claude-sonnet-4-5-20250929": rates}
