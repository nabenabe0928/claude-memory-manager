"""Tests for helper functions in app.py."""

import json
from pathlib import Path

import pytest
from testing_utils import create_project
from werkzeug.exceptions import BadRequest
from werkzeug.exceptions import NotFound

import app as app_module
from app import _encode_path
from app import _extract_session_summary
from app import _get_project_display_name
from app import _get_projects
from app import _parse_memory_file
from app import _resolve_project_dir
from app import _resolve_project_memory_dir


_ENCODED_HOME = str(Path.home()).strip("/").replace("/", "-").replace(".", "-")


class TestEncodePath:
    def test_basic_path_encoding(self):
        assert _encode_path("/Users/alice/projects") == "-Users-alice-projects"

    def test_dots_are_replaced_with_dashes(self):
        assert _encode_path("/home/user/.config") == "-home-user--config"

    def test_leading_and_trailing_slashes_are_stripped(self):
        assert _encode_path("/foo/bar/") == "-foo-bar"
        assert _encode_path("foo/bar") == "-foo-bar"

    def test_empty_string(self):
        assert _encode_path("") == "-"


class TestGetProjectDisplayName:
    def test_strips_home_prefix_and_restores_tilde(self):
        dirname = f"-{_ENCODED_HOME}-my-project"
        assert _get_project_display_name(dirname) == "~/my-project"

    def test_dirname_without_home_prefix_strips_leading_dash(self):
        assert _get_project_display_name("-some-other-dir") == "some-other-dir"

    def test_dirname_without_leading_dash(self):
        assert _get_project_display_name("plainname") == "plainname"

    def test_empty_string(self):
        assert _get_project_display_name("") == ""


class TestGetProjects:
    def test_returns_empty_list_when_dir_does_not_exist(self, monkeypatch, tmp_path):
        monkeypatch.setattr(app_module, "CLAUDE_PROJECTS_DIR", tmp_path / "nonexistent")
        assert _get_projects() == []

    def test_returns_empty_list_when_dir_is_empty(self, projects_dir):
        assert _get_projects() == []

    def test_skips_files_in_projects_dir(self, projects_dir):
        (projects_dir / "not-a-dir.txt").write_text("hello")
        assert _get_projects() == []

    def test_skips_projects_with_zero_memories_and_zero_sessions(self, projects_dir):
        (projects_dir / "empty-project").mkdir()
        assert _get_projects() == []

    def test_counts_memories_excluding_memory_md(self, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\ncontent",
                "MEMORY.md": "# Index\n- note.md",
            },
        )
        result = _get_projects()
        assert len(result) == 1
        assert result[0]["memoryCount"] == 1

    def test_counts_sessions(self, projects_dir):
        create_project(
            projects_dir,
            "proj",
            sessions={
                "sess1": [{"type": "user", "message": {"content": "hi"}}],
                "sess2": [{"type": "user", "message": {"content": "bye"}}],
            },
        )
        result = _get_projects()
        assert len(result) == 1
        assert result[0]["sessionCount"] == 2

    def test_project_fields(self, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "a.md": "---\nname: a\n---\nbody",
            },
        )
        result = _get_projects()
        proj = result[0]
        assert proj["id"] == "proj"
        assert proj["path"] == str(projects_dir / "proj")
        assert "displayName" in proj

    def test_returns_sorted_by_directory_name(self, projects_dir):
        create_project(projects_dir, "bbb", memories={"a.md": "---\nname: a\n---\n"})
        create_project(projects_dir, "aaa", memories={"a.md": "---\nname: a\n---\n"})
        result = _get_projects()
        assert result[0]["id"] == "aaa"
        assert result[1]["id"] == "bbb"

    def test_ignores_non_md_files_in_memory_dir(self, projects_dir):
        proj_dir = create_project(
            projects_dir,
            "proj",
            memories={
                "note.md": "---\nname: note\n---\n",
            },
        )
        (proj_dir / "memory" / "readme.txt").write_text("not a memory")
        result = _get_projects()
        assert result[0]["memoryCount"] == 1


class TestParseMemoryFile:
    def test_parses_name_and_content(self, tmp_path):
        f = tmp_path / "test.md"
        f.write_text("---\nname: My Note\ndescription: A desc\n---\nHello world")
        result = _parse_memory_file(f)
        assert result["name"] == "My Note"
        assert result["description"] == "A desc"
        assert result["content"] == "Hello world"
        assert result["filename"] == "test.md"

    def test_extracts_type_from_nested_metadata(self, tmp_path):
        f = tmp_path / "typed.md"
        f.write_text("---\nname: Typed\nmetadata:\n  type: preference\n---\ncontent")
        result = _parse_memory_file(f)
        assert result["type"] == "preference"

    def test_type_defaults_to_unknown_when_missing(self, tmp_path):
        f = tmp_path / "notype.md"
        f.write_text("---\nname: NoType\n---\ncontent")
        result = _parse_memory_file(f)
        assert result["type"] == "unknown"

    def test_name_defaults_to_stem_when_missing(self, tmp_path):
        f = tmp_path / "unnamed.md"
        f.write_text("---\ndescription: desc\n---\ncontent")
        result = _parse_memory_file(f)
        assert result["name"] == "unnamed"

    def test_description_defaults_to_empty_when_missing(self, tmp_path):
        f = tmp_path / "nodesc.md"
        f.write_text("---\nname: NoDesc\n---\ncontent")
        result = _parse_memory_file(f)
        assert result["description"] == ""

    def test_empty_frontmatter(self, tmp_path):
        f = tmp_path / "empty.md"
        f.write_text("---\n---\njust body")
        result = _parse_memory_file(f)
        assert result["name"] == "empty"
        assert result["content"] == "just body"
        assert result["type"] == "unknown"

    def test_metadata_field_not_dict_falls_back_to_unknown(self, tmp_path):
        f = tmp_path / "badmeta.md"
        f.write_text("---\nname: Bad\nmetadata: a string\n---\ncontent")
        result = _parse_memory_file(f)
        assert result["type"] == "unknown"


class TestExtractSessionSummary:
    def test_returns_first_user_text_content(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [
            {"type": "assistant", "message": {"content": "I'm an assistant"}},
            {"type": "user", "message": {"content": "Hello from user"}},
        ]
        f.write_text("\n".join(json.dumps(m) for m in messages))
        assert _extract_session_summary(f) == "Hello from user"

    def test_skips_messages_starting_with_angle_bracket(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [
            {"type": "user", "message": {"content": "<system>ignore</system>"}},
            {"type": "user", "message": {"content": "Real message"}},
        ]
        f.write_text("\n".join(json.dumps(m) for m in messages))
        assert _extract_session_summary(f) == "Real message"

    def test_truncates_long_content_to_200_chars(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        long_text = "A" * 500
        messages = [{"type": "user", "message": {"content": long_text}}]
        f.write_text(json.dumps(messages[0]))
        result = _extract_session_summary(f)
        assert len(result) == 200

    def test_handles_list_content_with_text_parts(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [
            {
                "type": "user",
                "message": {
                    "content": [
                        {"type": "image", "data": "base64..."},
                        {"type": "text", "text": "Explain this image"},
                    ],
                },
            }
        ]
        f.write_text(json.dumps(messages[0]))
        assert _extract_session_summary(f) == "Explain this image"

    def test_skips_list_text_starting_with_angle_bracket(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [
            {
                "type": "user",
                "message": {
                    "content": [
                        {"type": "text", "text": "<system>skip"},
                        {"type": "text", "text": "Good text"},
                    ],
                },
            }
        ]
        f.write_text(json.dumps(messages[0]))
        assert _extract_session_summary(f) == "Good text"

    def test_returns_fallback_when_no_user_messages(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [{"type": "assistant", "message": {"content": "hello"}}]
        f.write_text(json.dumps(messages[0]))
        assert _extract_session_summary(f) == "(no preview available)"

    def test_returns_fallback_for_nonexistent_file(self, tmp_path):
        f = tmp_path / "missing.jsonl"
        assert _extract_session_summary(f) == "(no preview available)"

    def test_returns_fallback_for_empty_file(self, tmp_path):
        f = tmp_path / "empty.jsonl"
        f.write_text("")
        assert _extract_session_summary(f) == "(no preview available)"

    def test_skips_messages_without_type_user(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        messages = [
            {"type": "system", "message": {"content": "system msg"}},
            {"message": {"content": "no type"}},
            {"type": "user", "message": {"content": "found it"}},
        ]
        f.write_text("\n".join(json.dumps(m) for m in messages))
        assert _extract_session_summary(f) == "found it"

    def test_truncates_list_text_to_200_chars(self, tmp_path):
        f = tmp_path / "sess.jsonl"
        long_text = "B" * 500
        messages = [
            {
                "type": "user",
                "message": {"content": [{"type": "text", "text": long_text}]},
            }
        ]
        f.write_text(json.dumps(messages[0]))
        result = _extract_session_summary(f)
        assert len(result) == 200


class TestResolveProjectDir:
    def test_returns_path_for_existing_project(self, projects_dir):
        create_project(
            projects_dir,
            "myproj",
            memories={
                "a.md": "---\nname: a\n---\n",
            },
        )
        with app_module.app.test_request_context():
            result = _resolve_project_dir("myproj")
        assert result == projects_dir / "myproj"

    def test_aborts_400_for_slash_in_project_id(self, projects_dir):
        with app_module.app.test_request_context():
            with pytest.raises(BadRequest):
                _resolve_project_dir("a/b")

    def test_aborts_400_for_dotdot_in_project_id(self, projects_dir):
        with app_module.app.test_request_context():
            with pytest.raises(BadRequest):
                _resolve_project_dir("a..b")

    def test_aborts_404_for_nonexistent_project(self, projects_dir):
        with app_module.app.test_request_context():
            with pytest.raises(NotFound):
                _resolve_project_dir("nonexistent")


class TestResolveProjectMemoryDir:
    def test_returns_memory_dir_when_it_exists(self, projects_dir):
        create_project(
            projects_dir,
            "proj",
            memories={
                "a.md": "---\nname: a\n---\n",
            },
        )
        with app_module.app.test_request_context():
            result = _resolve_project_memory_dir("proj")
        assert result == projects_dir / "proj" / "memory"

    def test_aborts_404_when_memory_dir_missing(self, projects_dir):
        (projects_dir / "proj").mkdir()
        with app_module.app.test_request_context():
            with pytest.raises(NotFound):
                _resolve_project_memory_dir("proj")


class TestDisplayPath:
    def test_home_directory_returns_tilde(self):
        from app import _display_path

        home = Path.home().resolve()
        assert _display_path(home) == "~"

    def test_path_under_home_returns_tilde_prefix(self):
        from app import _display_path

        home = Path.home().resolve()
        assert _display_path(home / "subdir") == "~/subdir"

    def test_nested_path_under_home(self):
        from app import _display_path

        home = Path.home().resolve()
        assert _display_path(home / "a" / "b" / "c") == "~/a/b/c"

    def test_path_outside_home_returns_unchanged(self):
        from app import _display_path

        assert _display_path(Path("/tmp/something")) == "/tmp/something"

    def test_path_with_home_prefix_but_different_dir(self):
        from app import _display_path

        home = Path.home().resolve()
        # e.g. /home/user vs /home/userextra — must NOT match
        fake_path = Path(str(home) + "extra/foo")
        result = _display_path(fake_path)
        assert result == str(fake_path)
        assert not result.startswith("~")


class TestBuildSessionDict:
    def test_returns_correct_id_filename_path(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "abc123.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"hi"}}\n')

        result = _build_session_dict(jsonl_file, project_dir, summary="test")
        assert result["id"] == "abc123"
        assert result["filename"] == "abc123.jsonl"
        assert result["path"] == str(jsonl_file)

    def test_uses_provided_summary(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"hello"}}\n')

        result = _build_session_dict(jsonl_file, project_dir, summary="custom summary")
        assert result["summary"] == "custom summary"

    def test_extracts_summary_when_none(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"auto extracted"}}\n')

        result = _build_session_dict(jsonl_file, project_dir)
        assert result["summary"] == "auto extracted"

    def test_has_companion_dir_true_when_dir_exists(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"hi"}}\n')
        companion = project_dir / "sess"
        companion.mkdir()

        result = _build_session_dict(jsonl_file, project_dir, summary="x")
        assert result["hasCompanionDir"] is True

    def test_has_companion_dir_false_when_no_dir(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"hi"}}\n')

        result = _build_session_dict(jsonl_file, project_dir, summary="x")
        assert result["hasCompanionDir"] is False

    def test_size_bytes_matches_file_size(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        content = '{"type":"user","message":{"content":"hello world"}}\n'
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text(content)

        result = _build_session_dict(jsonl_file, project_dir, summary="x")
        assert result["sizeBytes"] == jsonl_file.stat().st_size

    def test_modified_at_is_iso_format(self, tmp_path):
        from app import _build_session_dict

        project_dir = tmp_path / "proj"
        project_dir.mkdir()
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text('{"type":"user","message":{"content":"hi"}}\n')

        result = _build_session_dict(jsonl_file, project_dir, summary="x")
        # ISO format contains 'T' separator between date and time
        assert "T" in result["modifiedAt"]


class TestResolveSessionFile:
    def test_returns_path_for_valid_session(self, projects_dir):
        from app import _resolve_session_file

        create_project(
            projects_dir,
            "proj",
            sessions={"mysession": [{"type": "user", "message": {"content": "hi"}}]},
        )
        with app_module.app.test_request_context():
            result = _resolve_session_file("proj", "mysession")
        assert result == projects_dir / "proj" / "mysession.jsonl"
        assert result.is_file()

    def test_aborts_400_for_slash_in_session_id(self, projects_dir):
        from app import _resolve_session_file

        create_project(
            projects_dir,
            "proj",
            sessions={"s": [{"type": "user", "message": {"content": "hi"}}]},
        )
        with app_module.app.test_request_context():
            with pytest.raises(BadRequest):
                _resolve_session_file("proj", "a/b")

    def test_aborts_400_for_dotdot_in_session_id(self, projects_dir):
        from app import _resolve_session_file

        create_project(
            projects_dir,
            "proj",
            sessions={"s": [{"type": "user", "message": {"content": "hi"}}]},
        )
        with app_module.app.test_request_context():
            with pytest.raises(BadRequest):
                _resolve_session_file("proj", "a..b")

    def test_aborts_404_for_nonexistent_session(self, projects_dir):
        from app import _resolve_session_file

        create_project(
            projects_dir,
            "proj",
            sessions={"s": [{"type": "user", "message": {"content": "hi"}}]},
        )
        with app_module.app.test_request_context():
            with pytest.raises(NotFound):
                _resolve_session_file("proj", "nonexistent")
