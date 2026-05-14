"""Tests for Flask API endpoints in app.py."""

import json
import os

from testing_utils import create_project


class TestListProjectsEndpoint:
    def test_returns_empty_list_when_no_projects(self, client):
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_projects_with_memories(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj1",
            memories={
                "note.md": "---\nname: note\n---\ncontent",
            },
        )
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["id"] == "proj1"
        assert data[0]["memoryCount"] == 1
        assert data[0]["sessionCount"] == 0

    def test_returns_projects_with_sessions(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj2",
            sessions={
                "s1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        resp = client.get("/api/projects")
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["sessionCount"] == 1


class TestListMemoriesEndpoint:
    def test_returns_memories_for_project(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: My Note\ndescription: A note\n---\nBody text",
                "MEMORY.md": "# Index\n",
            },
        )
        resp = client.get("/api/projects/proj/memories")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["name"] == "My Note"
        assert data[0]["content"] == "Body text"

    def test_excludes_memory_md_index(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "a.md": "---\nname: A\n---\n",
                "MEMORY.md": "index",
            },
        )
        resp = client.get("/api/projects/proj/memories")
        data = resp.get_json()
        filenames = [m["filename"] for m in data]
        assert "MEMORY.md" not in filenames

    def test_returns_404_for_nonexistent_project(self, client, projects_dir):
        resp = client.get("/api/projects/nonexistent/memories")
        assert resp.status_code == 404

    def test_returns_404_when_memory_dir_missing(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "s1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        resp = client.get("/api/projects/proj/memories")
        assert resp.status_code == 404

    def test_path_traversal_in_project_id_does_not_leak(self, client, projects_dir):
        resp = client.get("/api/projects/../etc/memories")
        assert resp.status_code in (400, 404)

    def test_encoded_slash_in_project_id_does_not_leak(self, client, projects_dir):
        resp = client.get("/api/projects/a%2Fb/memories")
        assert resp.status_code in (400, 404)

    def test_handles_unparseable_memory_file_gracefully(self, client, projects_dir):
        proj = create_project(
            projects_dir,
            "proj",
            memories={
                "good.md": "---\nname: Good\n---\nOK",
            },
        )
        bad_file = proj / "memory" / "bad.md"
        bad_file.write_text("---\n: invalid yaml: [\n---\ncontent")
        resp = client.get("/api/projects/proj/memories")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2
        bad_entry = next(m for m in data if m["filename"] == "bad.md")
        assert bad_entry["description"] == "(failed to parse)"

    def test_returns_sorted_memory_files(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "z.md": "---\nname: Z\n---\n",
                "a.md": "---\nname: A\n---\n",
            },
        )
        resp = client.get("/api/projects/proj/memories")
        data = resp.get_json()
        assert data[0]["filename"] == "a.md"
        assert data[1]["filename"] == "z.md"


class TestDeleteMemoryEndpoint:
    def test_deletes_memory_file(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\ncontent",
            },
        )
        resp = client.delete("/api/projects/proj/memories/note.md")
        assert resp.status_code == 200
        assert resp.get_json() == {"deleted": "note.md"}
        assert not (projects_dir / "proj" / "memory" / "note.md").exists()

    def test_updates_memory_index_on_delete(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\ncontent",
                "MEMORY.md": "# Index\n- [note](note.md)\n- [other](other.md)\n",
            },
        )
        client.delete("/api/projects/proj/memories/note.md")
        index = (projects_dir / "proj" / "memory" / "MEMORY.md").read_text()
        assert "note.md" not in index
        assert "other.md" in index

    def test_clears_memory_index_when_all_entries_removed(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "only.md": "---\nname: only\n---\ncontent",
                "MEMORY.md": "- [only](only.md)\n",
            },
        )
        client.delete("/api/projects/proj/memories/only.md")
        index = (projects_dir / "proj" / "memory" / "MEMORY.md").read_text()
        assert index == ""

    def test_returns_404_for_nonexistent_memory(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "exists.md": "---\nname: e\n---\n",
            },
        )
        resp = client.delete("/api/projects/proj/memories/missing.md")
        assert resp.status_code == 404

    def test_returns_404_for_non_md_file(self, client, projects_dir):
        proj = create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\n",
            },
        )
        (proj / "memory" / "data.txt").write_text("data")
        resp = client.delete("/api/projects/proj/memories/data.txt")
        assert resp.status_code == 404

    def test_works_without_memory_index_file(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\ncontent",
            },
        )
        resp = client.delete("/api/projects/proj/memories/note.md")
        assert resp.status_code == 200
        assert resp.get_json() == {"deleted": "note.md"}


class TestListSessionsEndpoint:
    def test_returns_sessions_for_project(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "session1": [{"type": "user", "message": {"content": "Hello"}}],
            },
        )
        resp = client.get("/api/projects/proj/sessions")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["id"] == "session1"
        assert data[0]["filename"] == "session1.jsonl"
        assert data[0]["summary"] == "Hello"
        assert "modifiedAt" in data[0]
        assert "sizeBytes" in data[0]

    def test_returns_sessions_sorted_by_mtime_descending(self, client, projects_dir):
        proj = create_project(
            projects_dir,
            "proj",
            sessions={
                "older": [{"type": "user", "message": {"content": "old"}}],
                "newer": [{"type": "user", "message": {"content": "new"}}],
            },
        )
        os.utime(proj / "older.jsonl", (0, 0))
        resp = client.get("/api/projects/proj/sessions")
        data = resp.get_json()
        assert data[0]["id"] == "newer"
        assert data[1]["id"] == "older"

    def test_detects_companion_directory(self, client, projects_dir):
        proj = create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        (proj / "sess1").mkdir()
        resp = client.get("/api/projects/proj/sessions")
        data = resp.get_json()
        assert data[0]["hasCompanionDir"] is True

    def test_no_companion_directory(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        resp = client.get("/api/projects/proj/sessions")
        data = resp.get_json()
        assert data[0]["hasCompanionDir"] is False

    def test_returns_404_for_nonexistent_project(self, client, projects_dir):
        resp = client.get("/api/projects/ghost/sessions")
        assert resp.status_code == 404

    def test_returns_empty_list_when_no_sessions(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "a.md": "---\nname: a\n---\n",
            },
        )
        resp = client.get("/api/projects/proj/sessions")
        data = resp.get_json()
        assert data == []


class TestGetSessionEndpoint:
    def test_returns_parsed_messages(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "What is 2+2?"}},
                    {"type": "assistant", "message": {"content": "4"}},
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2
        assert data[0]["role"] == "user"
        assert data[0]["parts"] == [{"type": "text", "text": "What is 2+2?"}]
        assert data[1]["role"] == "assistant"

    def test_skips_messages_with_content_starting_with_angle_bracket(
        self,
        client,
        projects_dir,
    ):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "<system>hidden</system>"}},
                    {"type": "user", "message": {"content": "Visible"}},
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["parts"][0]["text"] == "Visible"

    def test_skips_empty_string_content(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "   "}},
                    {"type": "user", "message": {"content": "Real"}},
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["parts"][0]["text"] == "Real"

    def test_skips_non_user_and_non_assistant_messages(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "system", "message": {"content": "system msg"}},
                    {"type": "user", "message": {"content": "hi"}},
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert len(data) == 1

    def test_handles_list_content_with_text_parts(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [{"type": "text", "text": "Hello from list"}],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert data[0]["parts"][0]["text"] == "Hello from list"

    def test_handles_image_parts(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [{"type": "image", "data": "base64data"}],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert data[0]["parts"][0] == {"type": "image", "label": "[Image]"}

    def test_handles_tool_use_parts(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_use",
                                    "name": "read_file",
                                    "input": {"path": "/tmp/test.py"},
                                }
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        part = data[0]["parts"][0]
        assert part["type"] == "tool_use"
        assert part["label"] == "[Tool: read_file]"
        assert "/tmp/test.py" in part["detail"]

    def test_handles_tool_result_parts_with_text_list(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_result",
                                    "content": [
                                        {"type": "text", "text": "line1"},
                                        {"type": "text", "text": "line2"},
                                    ],
                                }
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        part = data[0]["parts"][0]
        assert part["type"] == "tool_result"
        assert part["label"] == "[Tool result]"
        assert "line1" in part["detail"]
        assert "line2" in part["detail"]

    def test_handles_tool_result_error(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_result",
                                    "content": "error message",
                                    "is_error": True,
                                }
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        part = data[0]["parts"][0]
        assert part["label"] == "[Tool result (error)]"
        assert part["detail"] == "error message"

    def test_handles_tool_result_with_string_content(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_result",
                                    "content": "raw string result",
                                }
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert data[0]["parts"][0]["detail"] == "raw string result"

    def test_returns_404_for_nonexistent_session(self, client, projects_dir):
        (projects_dir / "proj").mkdir()
        resp = client.get("/api/projects/proj/sessions/missing")
        assert resp.status_code == 404

    def test_path_traversal_in_session_id_does_not_leak(self, client, projects_dir):
        (projects_dir / "proj").mkdir()
        resp = client.get("/api/projects/proj/sessions/..%2F..%2Fetc")
        assert resp.status_code in (400, 404)

    def test_skips_malformed_json_lines(self, client, projects_dir):
        proj = create_project(projects_dir, "proj")
        jsonl = proj / "sess.jsonl"
        jsonl.write_text(
            "not valid json\n"
            + json.dumps({"type": "user", "message": {"content": "good"}})
            + "\n"
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["parts"][0]["text"] == "good"

    def test_skips_non_dict_items_in_list_content(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "user",
                        "message": {
                            "content": [
                                "not a dict",
                                {"type": "text", "text": "valid"},
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert len(data[0]["parts"]) == 1
        assert data[0]["parts"][0]["text"] == "valid"

    def test_tool_use_with_missing_name_defaults_to_question_mark(
        self,
        client,
        projects_dir,
    ):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {
                        "type": "assistant",
                        "message": {
                            "content": [
                                {
                                    "type": "tool_use",
                                    "input": {"key": "val"},
                                }
                            ],
                        },
                    }
                ],
            },
        )
        resp = client.get("/api/projects/proj/sessions/sess")
        data = resp.get_json()
        assert data[0]["parts"][0]["label"] == "[Tool: ?]"


class TestDeleteSessionEndpoint:
    def test_deletes_session_file(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        resp = client.delete("/api/projects/proj/sessions/sess1")
        assert resp.status_code == 200
        assert resp.get_json() == {"deleted": "sess1"}
        assert not (projects_dir / "proj" / "sess1.jsonl").exists()

    def test_deletes_companion_directory(self, client, projects_dir):
        proj = create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        companion = proj / "sess1"
        companion.mkdir()
        (companion / "artifact.txt").write_text("data")
        resp = client.delete("/api/projects/proj/sessions/sess1")
        assert resp.status_code == 200
        assert not companion.exists()

    def test_succeeds_without_companion_directory(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
            },
        )
        resp = client.delete("/api/projects/proj/sessions/sess1")
        assert resp.status_code == 200

    def test_returns_404_for_nonexistent_session(self, client, projects_dir):
        (projects_dir / "proj").mkdir()
        resp = client.delete("/api/projects/proj/sessions/missing")
        assert resp.status_code == 404

    def test_path_traversal_does_not_leak(self, client, projects_dir):
        (projects_dir / "proj").mkdir()
        resp = client.delete("/api/projects/proj/sessions/..%2F..%2Fetc")
        assert resp.status_code in (400, 404)

    def test_returns_404_for_nonexistent_project(self, client, projects_dir):
        resp = client.delete("/api/projects/ghost/sessions/s1")
        assert resp.status_code == 404


class TestDeleteSessionMessageEndpoint:
    def test_deletes_message_at_given_line_index(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "first"}},
                    {"type": "user", "message": {"content": "second"}},
                    {"type": "user", "message": {"content": "third"}},
                ],
            },
        )
        client.delete("/api/projects/proj/sessions/sess/messages/1")
        jsonl = projects_dir / "proj" / "sess.jsonl"
        lines = jsonl.read_text().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[0])["message"]["content"] == "first"
        assert json.loads(lines[1])["message"]["content"] == "third"

    def test_returns_deleted_line_index(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "first"}},
                    {"type": "user", "message": {"content": "second"}},
                    {"type": "user", "message": {"content": "third"}},
                ],
            },
        )
        resp = client.delete("/api/projects/proj/sessions/sess/messages/1")
        assert resp.status_code == 200
        assert resp.get_json() == {"deleted": 1}

    def test_returns_404_for_out_of_range_line_index(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "only"}},
                ],
            },
        )
        resp = client.delete("/api/projects/proj/sessions/sess/messages/5")
        assert resp.status_code == 404

    def test_returns_404_for_nonexistent_session(self, client, projects_dir):
        (projects_dir / "proj").mkdir()
        resp = client.delete("/api/projects/proj/sessions/missing/messages/0")
        assert resp.status_code == 404

    def test_returns_404_for_nonexistent_project(self, client, projects_dir):
        resp = client.delete("/api/projects/ghost/sessions/sess/messages/0")
        assert resp.status_code == 404

    def test_preserves_other_lines_after_deletion(self, client, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess": [
                    {"type": "user", "message": {"content": "alpha"}},
                    {"type": "user", "message": {"content": "beta"}},
                    {"type": "user", "message": {"content": "gamma"}},
                ],
            },
        )
        client.delete("/api/projects/proj/sessions/sess/messages/0")
        jsonl = projects_dir / "proj" / "sess.jsonl"
        lines = jsonl.read_text().splitlines()
        assert len(lines) == 2
        assert json.loads(lines[0])["message"]["content"] == "beta"
        assert json.loads(lines[1])["message"]["content"] == "gamma"
