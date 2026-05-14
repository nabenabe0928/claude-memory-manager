import json
import os
import re
from datetime import datetime
from pathlib import Path

import frontmatter
from flask import Flask, jsonify, abort
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def _get_project_display_name(dirname: str) -> str:
    home = str(Path.home()).strip("/").replace("/", "-").replace(".", "-")
    prefix = "-" + home + "-"
    if dirname.startswith(prefix):
        return "~/" + dirname[len(prefix):]
    return dirname.lstrip("-")


def _get_projects_with_memory() -> list[dict]:
    projects = []
    if not CLAUDE_PROJECTS_DIR.is_dir():
        return projects
    for entry in sorted(CLAUDE_PROJECTS_DIR.iterdir()):
        memory_dir = entry / "memory"
        if entry.is_dir() and memory_dir.is_dir():
            md_files = [f for f in memory_dir.iterdir() if f.suffix == ".md" and f.name != "MEMORY.md"]
            if md_files:
                projects.append({
                    "id": entry.name,
                    "displayName": _get_project_display_name(entry.name),
                    "memoryCount": len(md_files),
                })
    return projects


def _parse_memory_file(filepath: Path) -> dict:
    post = frontmatter.load(str(filepath))
    metadata = post.metadata
    mem_type = "unknown"
    if "metadata" in metadata and isinstance(metadata["metadata"], dict):
        mem_type = metadata["metadata"].get("type", "unknown")
    return {
        "filename": filepath.name,
        "name": metadata.get("name", filepath.stem),
        "description": metadata.get("description", ""),
        "type": mem_type,
        "content": post.content,
    }


def _resolve_project_memory_dir(project_id: str) -> Path:
    if "/" in project_id or ".." in project_id:
        abort(400, "Invalid project ID")
    memory_dir = CLAUDE_PROJECTS_DIR / project_id / "memory"
    if not memory_dir.is_dir():
        abort(404, "Project memory directory not found")
    return memory_dir


@app.route("/api/projects")
def list_projects():
    return jsonify(_get_projects_with_memory())


@app.route("/api/projects/<project_id>/memories")
def list_memories(project_id: str):
    memory_dir = _resolve_project_memory_dir(project_id)
    memories = []
    for f in sorted(memory_dir.iterdir()):
        if f.suffix == ".md" and f.name != "MEMORY.md":
            try:
                memories.append(_parse_memory_file(f))
            except Exception:
                memories.append({
                    "filename": f.name,
                    "name": f.stem,
                    "description": "(failed to parse)",
                    "type": "unknown",
                    "content": f.read_text(),
                })
    return jsonify(memories)


@app.route("/api/projects/<project_id>/memories/<filename>")
def get_memory(project_id: str, filename: str):
    memory_dir = _resolve_project_memory_dir(project_id)
    filepath = memory_dir / filename
    if not filepath.is_file() or filepath.suffix != ".md":
        abort(404, "Memory file not found")
    try:
        return jsonify(_parse_memory_file(filepath))
    except Exception:
        return jsonify({
            "filename": filepath.name,
            "name": filepath.stem,
            "description": "(failed to parse)",
            "type": "unknown",
            "content": filepath.read_text(),
        })


@app.route("/api/projects/<project_id>/memories/<filename>", methods=["DELETE"])
def delete_memory(project_id: str, filename: str):
    memory_dir = _resolve_project_memory_dir(project_id)
    filepath = memory_dir / filename
    if not filepath.is_file() or filepath.suffix != ".md":
        abort(404, "Memory file not found")

    filepath.unlink()

    memory_index = memory_dir / "MEMORY.md"
    if memory_index.is_file():
        lines = memory_index.read_text().splitlines()
        updated = [line for line in lines if filename not in line]
        memory_index.write_text("\n".join(updated) + "\n" if updated else "")

    return jsonify({"deleted": filename})


if __name__ == "__main__":
    app.run(port=5001, debug=True)
