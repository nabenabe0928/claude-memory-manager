"""Shared fixtures for backend tests."""

from pathlib import Path
import sys

import pytest


_backend_dir = str(Path(__file__).resolve().parent.parent)
_tests_dir = str(Path(__file__).resolve().parent)

# Ensure the backend directory and tests directory are on the import path.
for _p in (_backend_dir, _tests_dir):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import app as app_module  # noqa: E402


@pytest.fixture()
def projects_dir(tmp_path, monkeypatch):
    """Create a temporary projects directory and patch CLAUDE_PROJECTS_DIR to use it."""
    projects = tmp_path / "projects"
    projects.mkdir()
    monkeypatch.setattr(app_module, "CLAUDE_PROJECTS_DIR", projects)
    return projects


@pytest.fixture()
def client(projects_dir):
    """Create a Flask test client with the patched projects directory."""
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c
