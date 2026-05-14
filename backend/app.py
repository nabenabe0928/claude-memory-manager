from datetime import datetime
import json
from pathlib import Path
import shutil

from flask import abort
from flask import Flask
from flask import jsonify
from flask_cors import CORS
import frontmatter


app = Flask(__name__)
CORS(app)

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def _get_project_display_name(dirname: str) -> str:
    home = str(Path.home()).strip("/").replace("/", "-").replace(".", "-")
    prefix = "-" + home + "-"
    if dirname.startswith(prefix):
        return "~/" + dirname[len(prefix):]
    return dirname.lstrip("-")


def _get_projects() -> list[dict]:
    projects = []
    if not CLAUDE_PROJECTS_DIR.is_dir():
        return projects
    for entry in sorted(CLAUDE_PROJECTS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        memory_dir = entry / "memory"
        memory_count = 0
        if memory_dir.is_dir():
            memory_count = len([f for f in memory_dir.iterdir() if f.suffix == ".md" and f.name != "MEMORY.md"])
        session_count = len([f for f in entry.iterdir() if f.suffix == ".jsonl"])
        if memory_count == 0 and session_count == 0:
            continue
        projects.append({
            "id": entry.name,
            "displayName": _get_project_display_name(entry.name),
            "path": str(entry),
            "memoryCount": memory_count,
            "sessionCount": session_count,
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
        "path": str(filepath),
        "name": metadata.get("name", filepath.stem),
        "description": metadata.get("description", ""),
        "type": mem_type,
        "content": post.content,
    }


def _extract_session_summary(filepath: Path) -> str:
    try:
        with open(filepath) as fh:
            for line in fh:
                msg = json.loads(line)
                if msg.get("type") != "user" or "message" not in msg:
                    continue
                content = msg["message"].get("content", "")
                if isinstance(content, str) and not content.startswith("<"):
                    return content[:200]
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text" and not part["text"].startswith("<"):
                            return part["text"][:200]
    except Exception:
        pass
    return "(no preview available)"


def _resolve_project_dir(project_id: str) -> Path:
    if "/" in project_id or ".." in project_id:
        abort(400, "Invalid project ID")
    project_dir = CLAUDE_PROJECTS_DIR / project_id
    if not project_dir.is_dir():
        abort(404, "Project not found")
    return project_dir


def _resolve_project_memory_dir(project_id: str) -> Path:
    project_dir = _resolve_project_dir(project_id)
    memory_dir = project_dir / "memory"
    if not memory_dir.is_dir():
        abort(404, "Project memory directory not found")
    return memory_dir


def _resolve_session_file(project_id: str, session_id: str) -> Path:
    project_dir = _resolve_project_dir(project_id)
    if "/" in session_id or ".." in session_id:
        abort(400, "Invalid session ID")
    jsonl_file = project_dir / f"{session_id}.jsonl"
    if not jsonl_file.is_file():
        abort(404, "Session not found")
    return jsonl_file


@app.route("/api/projects")
def list_projects():
    return jsonify(_get_projects())


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
                    "path": str(f),
                    "name": f.stem,
                    "description": "(failed to parse)",
                    "type": "unknown",
                    "content": f.read_text(),
                })
    return jsonify(memories)


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


@app.route("/api/projects/<project_id>/sessions")
def list_sessions(project_id: str):
    project_dir = _resolve_project_dir(project_id)
    sessions = []
    for f in sorted(project_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.suffix != ".jsonl":
            continue
        stat = f.stat()
        session_id = f.stem
        companion_dir = project_dir / session_id
        sessions.append({
            "id": session_id,
            "filename": f.name,
            "path": str(f),
            "summary": _extract_session_summary(f),
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "sizeBytes": stat.st_size,
            "hasCompanionDir": companion_dir.is_dir(),
        })
    return jsonify(sessions)


@app.route("/api/projects/<project_id>/sessions/<session_id>")
def get_session(project_id: str, session_id: str):
    jsonl_file = _resolve_session_file(project_id, session_id)

    messages = []
    with open(jsonl_file) as fh:
        for line_index, line in enumerate(fh):
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg_type = msg.get("type")
            if msg_type not in ("user", "assistant"):
                continue
            message = msg.get("message", {})
            content = message.get("content", "")
            if isinstance(content, str):
                if content.lstrip().startswith("<"):
                    continue
                if content.strip():
                    messages.append({
                        "role": msg_type,
                        "lineIndex": line_index,
                        "parts": [{"type": "text", "text": content}],
                    })
            elif isinstance(content, list):
                parts = []
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    ptype = part.get("type")
                    if ptype == "text":
                        parts.append({"type": "text", "text": part["text"]})
                    elif ptype == "image":
                        parts.append({"type": "image", "label": "[Image]"})
                    elif ptype == "tool_use":
                        name = part.get("name", "?")
                        detail = json.dumps(part.get("input", {}), indent=2, ensure_ascii=False)
                        parts.append({
                            "type": "tool_use",
                            "label": f"[Tool: {name}]",
                            "detail": detail,
                        })
                    elif ptype == "tool_result":
                        raw = part.get("content", "")
                        if isinstance(raw, list):
                            detail = "\n".join(
                                p.get("text", "") for p in raw if isinstance(p, dict) and p.get("type") == "text"
                            )
                        else:
                            detail = str(raw)
                        is_error = part.get("is_error", False)
                        parts.append({
                            "type": "tool_result",
                            "label": "[Tool result]" if not is_error else "[Tool result (error)]",
                            "detail": detail,
                        })
                if parts:
                    messages.append({"role": msg_type, "lineIndex": line_index, "parts": parts})
    return jsonify(messages)


@app.route("/api/projects/<project_id>/sessions/<session_id>/messages/<int:line_index>", methods=["DELETE"])
def delete_session_message(project_id: str, session_id: str, line_index: int):
    jsonl_file = _resolve_session_file(project_id, session_id)

    with open(jsonl_file) as fh:
        lines = fh.readlines()
    if line_index < 0 or line_index >= len(lines):
        abort(404, "Message not found")

    del lines[line_index]
    with open(jsonl_file, "w") as fh:
        fh.writelines(lines)

    return jsonify({"deleted": line_index})


@app.route("/api/projects/<project_id>/sessions/<session_id>", methods=["DELETE"])
def delete_session(project_id: str, session_id: str):
    jsonl_file = _resolve_session_file(project_id, session_id)
    companion_dir = jsonl_file.parent / session_id

    jsonl_file.unlink()
    if companion_dir.is_dir():
        shutil.rmtree(companion_dir)

    return jsonify({"deleted": session_id})


if __name__ == "__main__":
    app.run(port=5001, debug=True)
