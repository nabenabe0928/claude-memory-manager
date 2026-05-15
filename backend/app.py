from collections import defaultdict
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import uuid

from flask import abort
from flask import Flask
from flask import jsonify
from flask import request
from flask_cors import CORS
import frontmatter

from tool_formatters import format_tool_input


app = Flask(__name__)
CORS(app)


@app.after_request
def _no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"


def _encode_path(real_path: str) -> str:
    return "-" + real_path.strip("/").replace("/", "-").replace(".", "-")


def _display_path(real_path: Path) -> str:
    home = Path.home().resolve()
    home_str = str(home)
    rp = str(real_path)
    if rp == home_str:
        return "~"
    if rp.startswith(home_str + "/"):
        return "~/" + rp[len(home_str) + 1 :]
    return rp


def _get_project_display_name(dirname: str) -> str:
    prefix = _encode_path(str(Path.home())) + "-"
    if dirname.startswith(prefix):
        return "~/" + dirname[len(prefix) :]
    return dirname.lstrip("-")


def _get_project_counts() -> dict[str, dict]:
    result: dict[str, dict] = {}
    if not CLAUDE_PROJECTS_DIR.is_dir():
        return result
    for entry in CLAUDE_PROJECTS_DIR.iterdir():
        if not entry.is_dir():
            continue
        memory_dir = entry / "memory"
        memory_count = 0
        if memory_dir.is_dir():
            memory_count = len(
                [f for f in memory_dir.iterdir() if f.suffix == ".md" and f.name != "MEMORY.md"]
            )
        session_count = len([f for f in entry.iterdir() if f.suffix == ".jsonl"])
        if memory_count == 0 and session_count == 0:
            continue
        result[entry.name] = {
            "id": entry.name,
            "memoryCount": memory_count,
            "sessionCount": session_count,
        }
    return result


def _get_projects() -> list[dict]:
    counts = _get_project_counts()
    projects = []
    for dirname in sorted(counts):
        info = counts[dirname]
        projects.append(
            {
                "id": dirname,
                "displayName": _get_project_display_name(dirname),
                "path": str(CLAUDE_PROJECTS_DIR / dirname),
                "memoryCount": info["memoryCount"],
                "sessionCount": info["sessionCount"],
            }
        )
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
                        if (
                            isinstance(part, dict)
                            and part.get("type") == "text"
                            and not part["text"].startswith("<")
                        ):
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


def _build_session_dict(
    jsonl_file: Path, project_dir: Path, *, summary: str | None = None
) -> dict:
    stat = jsonl_file.stat()
    session_id = jsonl_file.stem
    return {
        "id": session_id,
        "filename": jsonl_file.name,
        "path": str(jsonl_file),
        "summary": summary if summary is not None else _extract_session_summary(jsonl_file),
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "sizeBytes": stat.st_size,
        "hasCompanionDir": (project_dir / session_id).is_dir(),
    }


def _resolve_session_file(project_id: str, session_id: str) -> Path:
    project_dir = _resolve_project_dir(project_id)
    if "/" in session_id or ".." in session_id:
        abort(400, "Invalid session ID")
    jsonl_file = project_dir / f"{session_id}.jsonl"
    if not jsonl_file.is_file():
        abort(404, "Session not found")
    return jsonl_file


def _collect_cascade_indices(lines: list[str], target_indices: set[int]) -> list[int]:
    uuid_at: dict[int, str] = {}
    children_of: dict[str, list[int]] = defaultdict(list)

    for i, line in enumerate(lines):
        try:
            obj = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue
        uuid_val = obj.get("uuid")
        parent_val = obj.get("parentUuid")
        if uuid_val:
            uuid_at[i] = uuid_val
        if parent_val:
            children_of[parent_val].append(i)

    to_delete = set(target_indices)
    queue = [uuid_at[idx] for idx in target_indices if idx in uuid_at]
    visited: set[str] = set()
    while queue:
        uid = queue.pop()
        if uid in visited:
            continue
        visited.add(uid)
        for child_idx in children_of.get(uid, []):
            to_delete.add(child_idx)
            child_uid = uuid_at.get(child_idx)
            if child_uid:
                queue.append(child_uid)

    return sorted(to_delete)


@app.route("/api/projects")
def list_projects():
    return jsonify(_get_projects())


@app.route("/api/projects/<project_id>/counts")
def project_counts(project_id: str):
    project_dir = _resolve_project_dir(project_id)
    memory_dir = project_dir / "memory"
    memory_count = 0
    if memory_dir.is_dir():
        memory_count = sum(
            1 for f in memory_dir.iterdir() if f.suffix == ".md" and f.name != "MEMORY.md"
        )
    session_count = sum(1 for f in project_dir.iterdir() if f.suffix == ".jsonl")
    return jsonify({"memoryCount": memory_count, "sessionCount": session_count})


@app.route("/api/projects/<project_id>/memories")
def list_memories(project_id: str):
    memory_dir = _resolve_project_memory_dir(project_id)
    memories = []
    for f in sorted(memory_dir.iterdir()):
        if f.suffix == ".md" and f.name != "MEMORY.md":
            try:
                memories.append(_parse_memory_file(f))
            except Exception:
                memories.append(
                    {
                        "filename": f.name,
                        "path": str(f),
                        "name": f.stem,
                        "description": "(failed to parse)",
                        "type": "unknown",
                        "content": f.read_text(),
                    }
                )
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


@app.route("/api/projects/<project_id>/memories/batch-delete", methods=["POST"])
def batch_delete_memories(project_id: str):
    memory_dir = _resolve_project_memory_dir(project_id)
    data = request.get_json(force=True)
    filenames = data.get("filenames", [])
    if not isinstance(filenames, list) or not filenames:
        abort(400, "filenames must be a non-empty list")

    deleted = []
    for filename in filenames:
        if "/" in filename or ".." in filename:
            continue
        filepath = memory_dir / filename
        if filepath.is_file() and filepath.suffix == ".md":
            filepath.unlink()
            deleted.append(filename)

    memory_index = memory_dir / "MEMORY.md"
    if deleted and memory_index.is_file():
        deleted_set = set(deleted)
        lines = memory_index.read_text().splitlines()
        updated = [line for line in lines if not any(fn in line for fn in deleted_set)]
        memory_index.write_text("\n".join(updated) + "\n" if updated else "")

    return jsonify({"deleted": deleted})


@app.route("/api/projects/<project_id>/sessions")
def list_sessions(project_id: str):
    project_dir = _resolve_project_dir(project_id)
    sessions = []
    for f in sorted(project_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.suffix != ".jsonl":
            continue
        sessions.append(_build_session_dict(f, project_dir))
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
            uuid_val = msg.get("uuid")
            parent_uuid_val = msg.get("parentUuid")
            if isinstance(content, str):
                if content.lstrip().startswith("<"):
                    continue
                if content.strip():
                    messages.append(
                        {
                            "role": msg_type,
                            "lineIndex": line_index,
                            "uuid": uuid_val,
                            "parentUuid": parent_uuid_val,
                            "parts": [{"type": "text", "text": content}],
                        }
                    )
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
                        detail = format_tool_input(name, part.get("input", {}))
                        parts.append(
                            {
                                "type": "tool_use",
                                "label": f"[Tool: {name}]",
                                "detail": detail,
                            }
                        )
                    elif ptype == "tool_result":
                        raw = part.get("content", "")
                        if isinstance(raw, list):
                            detail = "\n".join(
                                p.get("text", "")
                                for p in raw
                                if isinstance(p, dict) and p.get("type") == "text"
                            )
                        else:
                            detail = str(raw)
                        is_error = part.get("is_error", False)
                        parts.append(
                            {
                                "type": "tool_result",
                                "label": "[Tool result]"
                                if not is_error
                                else "[Tool result (error)]",
                                "detail": detail,
                            }
                        )
                if parts:
                    messages.append(
                        {
                            "role": msg_type,
                            "lineIndex": line_index,
                            "uuid": uuid_val,
                            "parentUuid": parent_uuid_val,
                            "parts": parts,
                        }
                    )
    return jsonify(messages)


@app.route(
    "/api/projects/<project_id>/sessions/<session_id>/messages/<int:line_index>",
    methods=["DELETE"],
)
def delete_session_message(project_id: str, session_id: str, line_index: int):
    jsonl_file = _resolve_session_file(project_id, session_id)

    with open(jsonl_file) as fh:
        lines = fh.readlines()
    if line_index < 0 or line_index >= len(lines):
        abort(404, "Message not found")

    all_indices = _collect_cascade_indices(lines, {line_index})
    for i in sorted(all_indices, reverse=True):
        del lines[i]
    with open(jsonl_file, "w") as fh:
        fh.writelines(lines)

    return jsonify({"deleted": all_indices})


@app.route("/api/projects/<project_id>/sessions/batch-delete", methods=["POST"])
def batch_delete_sessions(project_id: str):
    project_dir = _resolve_project_dir(project_id)
    data = request.get_json(force=True)
    session_ids = data.get("sessionIds", [])
    if not isinstance(session_ids, list) or not session_ids:
        abort(400, "sessionIds must be a non-empty list")

    deleted = []
    for session_id in session_ids:
        if "/" in session_id or ".." in session_id:
            continue
        jsonl_file = project_dir / f"{session_id}.jsonl"
        if jsonl_file.is_file():
            companion_dir = project_dir / session_id
            jsonl_file.unlink()
            if companion_dir.is_dir():
                shutil.rmtree(companion_dir)
            deleted.append(session_id)

    return jsonify({"deleted": deleted})


@app.route(
    "/api/projects/<project_id>/sessions/<session_id>/messages/batch-delete",
    methods=["POST"],
)
def batch_delete_session_messages(project_id: str, session_id: str):
    jsonl_file = _resolve_session_file(project_id, session_id)
    data = request.get_json(force=True)
    line_indices = data.get("lineIndices", [])
    if not isinstance(line_indices, list) or not line_indices:
        abort(400, "lineIndices must be a non-empty list")

    with open(jsonl_file) as fh:
        lines = fh.readlines()

    valid_indices = {i for i in line_indices if 0 <= i < len(lines)}
    all_indices = _collect_cascade_indices(lines, valid_indices)
    for i in sorted(all_indices, reverse=True):
        del lines[i]

    with open(jsonl_file, "w") as fh:
        fh.writelines(lines)

    return jsonify({"deleted": all_indices})


@app.route("/api/projects/<project_id>/sessions/<session_id>", methods=["DELETE"])
def delete_session(project_id: str, session_id: str):
    jsonl_file = _resolve_session_file(project_id, session_id)
    companion_dir = jsonl_file.parent / session_id

    jsonl_file.unlink()
    if companion_dir.is_dir():
        shutil.rmtree(companion_dir)

    return jsonify({"deleted": session_id})


@app.route(
    "/api/projects/<project_id>/sessions/<session_id>/duplicate",
    methods=["POST"],
)
def duplicate_session(project_id: str, session_id: str):
    jsonl_file = _resolve_session_file(project_id, session_id)
    project_dir = jsonl_file.parent

    summary = _extract_session_summary(jsonl_file)

    new_id = str(uuid.uuid4())
    new_jsonl = project_dir / f"{new_id}.jsonl"
    shutil.copy2(jsonl_file, new_jsonl)

    companion_dir = project_dir / session_id
    if companion_dir.is_dir():
        shutil.copytree(companion_dir, project_dir / new_id)

    return jsonify(_build_session_dict(new_jsonl, project_dir, summary=summary)), 201


@app.route("/api/tree")
def list_tree():
    path = request.args.get("path", str(Path.home()))
    real_path = Path(path).resolve()
    if not real_path.is_dir():
        abort(400, "Not a directory")

    home = Path.home().resolve()
    if real_path != home and not str(real_path).startswith(str(home) + "/"):
        abort(403, "Path must be under home directory")

    all_projects = _get_project_counts()

    self_encoded = _encode_path(str(real_path))
    self_project = all_projects.get(self_encoded)

    display_path = _display_path(real_path)

    children = []
    try:
        dir_entries = sorted(os.scandir(str(real_path)), key=lambda e: e.name)
    except PermissionError:
        dir_entries = []

    for entry in dir_entries:
        if entry.name.startswith(".") or not entry.is_dir():
            continue
        child_path = real_path / entry.name

        child_encoded = _encode_path(str(child_path))
        child_project = all_projects.get(child_encoded)
        is_project = child_project is not None

        child_prefix = child_encoded + "-"
        has_descendants = any(k.startswith(child_prefix) for k in all_projects)

        if not is_project and not has_descendants:
            continue

        children.append(
            {
                "name": entry.name,
                "path": str(child_path),
                "isProject": is_project,
                "projectId": child_project["id"] if child_project else None,
                "projectPath": str(CLAUDE_PROJECTS_DIR / child_encoded) if child_project else None,
                "memoryCount": child_project["memoryCount"] if child_project else 0,
                "sessionCount": child_project["sessionCount"] if child_project else 0,
                "hasChildren": has_descendants,
            }
        )

    return jsonify(
        {
            "path": str(real_path),
            "displayPath": display_path,
            "selfProject": {
                "id": self_project["id"],
                "projectPath": str(CLAUDE_PROJECTS_DIR / self_encoded),
                "memoryCount": self_project["memoryCount"],
                "sessionCount": self_project["sessionCount"],
            }
            if self_project
            else None,
            "children": children,
        }
    )


if __name__ == "__main__":
    app.run(port=5001, debug=True)
