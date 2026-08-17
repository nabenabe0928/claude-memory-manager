"""Tests for helper functions in app.py."""

import json
from pathlib import Path

import pytest
from testing_utils import create_project
from testing_utils import create_subagent
from testing_utils import make_assistant_record
from werkzeug.exceptions import BadRequest
from werkzeug.exceptions import NotFound

import app as app_module
from app import _collect_cascade_indices
from app import _encode_path
from app import _extract_session_summary
from app import _get_project_display_name
from app import _get_projects
from app import _parse_memory_file
from app import _resolve_project_dir
from app import _resolve_project_memory_dir
from cache_stats import _attribute
from cache_stats import _build_subagents
from cache_stats import _load_turns
from cache_stats import _read_agent_labels
from cache_stats import _summarize
from cache_stats import _SYNTHETIC_MODEL
from cache_stats import build_cache_stats


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


class TestCollectCascadeIndices:
    def test_linear_chain_delete_root_removes_all_descendants(self):
        lines = [
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
            json.dumps({"uuid": "ccc", "parentUuid": "bbb", "type": "user"}),
        ]
        result = _collect_cascade_indices(lines, {0})
        assert result == [0, 1, 2]

    def test_mid_chain_delete_preserves_earlier_messages(self):
        lines = [
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
            json.dumps({"uuid": "ccc", "parentUuid": "bbb", "type": "user"}),
            json.dumps({"uuid": "ddd", "parentUuid": "ccc", "type": "assistant"}),
        ]
        result = _collect_cascade_indices(lines, {1})
        assert result == [1, 2, 3]

    def test_branching_parent_with_two_children_cascades_both(self):
        lines = [
            json.dumps({"uuid": "root", "type": "user"}),
            json.dumps({"uuid": "left", "parentUuid": "root", "type": "assistant"}),
            json.dumps({"uuid": "right", "parentUuid": "root", "type": "assistant"}),
            json.dumps({"uuid": "left-child", "parentUuid": "left", "type": "user"}),
        ]
        result = _collect_cascade_indices(lines, {0})
        assert result == [0, 1, 2, 3]

    def test_leaf_node_no_cascade(self):
        lines = [
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
        ]
        result = _collect_cascade_indices(lines, {1})
        assert result == [1]

    def test_metadata_line_without_uuid_no_cascade(self):
        lines = [
            json.dumps({"type": "permission-mode"}),
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
        ]
        result = _collect_cascade_indices(lines, {0})
        assert result == [0]

    def test_overlapping_targets_parent_and_child_deduplicated(self):
        lines = [
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
            json.dumps({"uuid": "ccc", "parentUuid": "bbb", "type": "user"}),
        ]
        result_both = _collect_cascade_indices(lines, {0, 1})
        result_root = _collect_cascade_indices(lines, {0})
        assert result_both == result_root == [0, 1, 2]

    def test_empty_targets_returns_empty_list(self):
        lines = [
            json.dumps({"uuid": "aaa", "type": "user"}),
            json.dumps({"uuid": "bbb", "parentUuid": "aaa", "type": "assistant"}),
        ]
        result = _collect_cascade_indices(lines, set())
        assert result == []


_ZERO_USAGE = {
    "input_tokens": 0,
    "output_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 0,
    "cache_creation": {},
}
_CACHE_MISS_USAGE = {
    "cache_read_input_tokens": 0,
    "cache_creation_input_tokens": 9999,
    "cache_creation": {"ephemeral_5m_input_tokens": 9999},
}
_USAGE_1H = {
    "cache_read_input_tokens": 50,
    "cache_creation_input_tokens": 5,
    "cache_creation": {"ephemeral_1h_input_tokens": 5},
}


def _write_session(projects_dir, records):
    """Write records as a session JSONL and return its path."""
    project_dir = create_project(projects_dir, "proj", sessions={"sess": records})
    return project_dir / "sess.jsonl"


def _write_session_with_agents(projects_dir, agents, records=None):
    """Write session `sess` plus one subagent per `(agent_id, records, meta)` triple."""
    jsonl_file = _write_session(projects_dir, records or [])
    for agent_id, agent_records, meta in agents:
        create_subagent(jsonl_file.parent, "sess", agent_id, agent_records, meta)
    return jsonl_file


def _load(projects_dir, records):
    return _load_turns(_write_session(projects_dir, records))


def _attributed(projects_dir, records):
    turns, _ = _load(projects_dir, records)
    _attribute(turns)
    return turns


class TestLoadTurns:
    def test_duplicate_lines_sharing_request_id_collapse_to_one_turn(self, projects_dir):
        records = [make_assistant_record("r1", "m1"), make_assistant_record("r1", "m1")]
        turns, skipped = _load(projects_dir, records)
        assert len(turns) == 1
        assert skipped == 0

    def test_record_without_request_id_and_message_id_is_skipped(self, projects_dir):
        turns, skipped = _load(projects_dir, [make_assistant_record(None, None)])
        assert turns == []
        assert skipped == 1

    def test_null_request_id_falls_back_to_message_id(self, projects_dir):
        turns, skipped = _load(projects_dir, [make_assistant_record(None, "m1")])
        assert len(turns) == 1
        assert skipped == 0

    def test_synthetic_records_are_excluded(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record(None, "m2", model=_SYNTHETIC_MODEL, usage=_ZERO_USAGE),
        ]
        turns, skipped = _load(projects_dir, records)
        assert [t.model for t in turns] == ["claude-opus-5"]
        assert skipped == 0

    def test_sidechain_records_are_excluded(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record("r2", "m2", is_sidechain=True),
        ]
        turns, _ = _load(projects_dir, records)
        assert len(turns) == 1

    def test_sidechain_records_are_kept_when_explicitly_included(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record("r2", "m2", is_sidechain=True),
        ]
        jsonl_file = _write_session(projects_dir, records)
        turns, _ = _load_turns(jsonl_file, include_sidechain=True)
        assert len(turns) == 2

    def test_non_assistant_records_are_excluded(self, projects_dir):
        records = [
            {"type": "user", "message": {"content": "hi"}},
            make_assistant_record("r1", "m1"),
        ]
        turns, _ = _load(projects_dir, records)
        assert len(turns) == 1

    def test_malformed_json_line_is_skipped(self, projects_dir):
        project_dir = create_project(projects_dir, "proj")
        jsonl_file = project_dir / "sess.jsonl"
        jsonl_file.write_text(
            "not valid json\n" + json.dumps(make_assistant_record("r1", "m1")) + "\n"
        )
        turns, skipped = _load_turns(jsonl_file)
        assert len(turns) == 1
        assert skipped == 0

    def test_turns_are_sorted_by_timestamp(self, projects_dir):
        records = [
            make_assistant_record("r2", "m2", timestamp="2026-08-17T00:02:00Z"),
            make_assistant_record("r1", "m1", timestamp="2026-08-17T00:01:00Z"),
        ]
        turns, _ = _load(projects_dir, records)
        assert [t.timestamp for t in turns] == [
            "2026-08-17T00:01:00Z",
            "2026-08-17T00:02:00Z",
        ]

    @pytest.mark.parametrize(
        "usage, expected_ttl_s",
        [(None, 300), (_USAGE_1H, 3600)],
    )
    def test_ttl_is_read_from_the_observed_ephemeral_split(
        self, projects_dir, usage, expected_ttl_s
    ):
        turns, _ = _load(projects_dir, [make_assistant_record("r1", "m1", usage=usage)])
        assert turns[0].ttl_s == expected_ttl_s

    def test_usage_counters_are_copied_from_the_record(self, projects_dir):
        usage = {
            "input_tokens": 3,
            "output_tokens": 7,
            "cache_read_input_tokens": 100,
            "cache_creation_input_tokens": 10,
            "cache_creation": {"ephemeral_5m_input_tokens": 10},
        }
        turns, _ = _load(projects_dir, [make_assistant_record("r1", "m1", usage=usage)])
        turn = turns[0]
        assert (turn.cache_read, turn.cache_creation, turn.uncached, turn.output) == (
            100,
            10,
            3,
            7,
        )


class TestAttribute:
    def test_first_turn_is_session_start(self, projects_dir):
        turns = _attributed(projects_dir, [make_assistant_record("r1", "m1")])
        assert turns[0].cause == "session start"
        assert turns[0].gap_s is None

    @pytest.mark.parametrize(
        "changed_field, changed_value, expected_cause",
        [
            ("model", "claude-haiku-5", "MODEL SWITCH"),
            ("version", "2.1.221", "CC UPGRADE"),
            ("effort", "high", "EFFORT CHANGE"),
        ],
    )
    def test_changed_field_maps_to_its_cause(
        self, projects_dir, changed_field, changed_value, expected_cause
    ):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record(
                "r2",
                "m2",
                timestamp="2026-08-17T00:01:00Z",
                **{changed_field: changed_value},
            ),
        ]
        turns = _attributed(projects_dir, records)
        assert turns[1].cause == expected_cause

    def test_turn_following_a_compact_summary_is_compact(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            {"type": "user", "isCompactSummary": True, "parentUuid": "p1"},
            make_assistant_record("r2", "m2", parent_uuid="p1", timestamp="2026-08-17T00:01:00Z"),
        ]
        turns = _attributed(projects_dir, records)
        assert turns[1].cause == "COMPACT"

    def test_gap_beyond_previous_turn_ttl_is_ttl_expiry(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record(
                "r2", "m2", timestamp="2026-08-17T00:20:00Z", usage=_CACHE_MISS_USAGE
            ),
        ]
        turns = _attributed(projects_dir, records)
        assert turns[1].cause == "TTL expiry"
        assert turns[1].gap_s == 1200.0

    def test_gap_within_previous_turn_ttl_is_unexplained(self, projects_dir):
        # The 20-minute gap fits inside the 1h cache the previous turn bought.
        records = [
            make_assistant_record("r1", "m1", usage=_USAGE_1H),
            make_assistant_record(
                "r2", "m2", timestamp="2026-08-17T00:20:00Z", usage=_CACHE_MISS_USAGE
            ),
        ]
        turns = _attributed(projects_dir, records)
        assert turns[1].cause == "unexplained"

    def test_cache_hit_turn_has_no_cause(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record("r2", "m2", timestamp="2026-08-17T00:01:00Z"),
        ]
        turns = _attributed(projects_dir, records)
        assert turns[1].cause == "-"

    def test_synthetic_record_does_not_trigger_a_model_switch(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record(
                None,
                "m2",
                model=_SYNTHETIC_MODEL,
                timestamp="2026-08-17T00:01:00Z",
                usage=_ZERO_USAGE,
            ),
            make_assistant_record("r2", "m3", timestamp="2026-08-17T00:02:00Z"),
        ]
        turns = _attributed(projects_dir, records)
        assert [t.cause for t in turns] == ["session start", "-"]

    def test_hit_rate_is_the_read_share_of_the_prompt(self, projects_dir):
        turns = _attributed(projects_dir, [make_assistant_record("r1", "m1")])
        assert turns[0].hit_rate == pytest.approx(100 / 110)

    def test_zero_token_turn_hit_rate_is_none(self, projects_dir):
        records = [make_assistant_record("r1", "m1", usage=_ZERO_USAGE)]
        turns = _attributed(projects_dir, records)
        assert turns[0].hit_rate is None


class TestSummarize:
    def test_empty_session_hit_rate_is_none(self):
        assert _summarize([]) == {
            "turnCount": 0,
            "cacheRead": 0,
            "cacheCreation": 0,
            "uncached": 0,
            "output": 0,
            "hitRate": None,
        }

    def test_counters_are_summed_across_turns(self, projects_dir):
        records = [
            make_assistant_record("r1", "m1"),
            make_assistant_record("r2", "m2", timestamp="2026-08-17T00:01:00Z"),
        ]
        turns = _attributed(projects_dir, records)
        summary = _summarize(turns)
        assert summary["turnCount"] == 2
        assert summary["cacheRead"] == 200
        assert summary["cacheCreation"] == 20
        assert summary["hitRate"] == pytest.approx(200 / 220)


class TestBuildCacheStats:
    def test_empty_session_returns_no_turns_and_null_hit_rate(self, projects_dir):
        stats = build_cache_stats(_write_session(projects_dir, []))
        assert stats["turns"] == []
        assert stats["session"]["hitRate"] is None
        assert stats["skipped"] == 0

    def test_turn_payload_uses_camel_case_keys(self, projects_dir):
        jsonl_file = _write_session(projects_dir, [make_assistant_record("r1", "m1")])
        stats = build_cache_stats(jsonl_file)
        assert stats["turns"][0] == {
            "cacheRead": 100,
            "cacheCreation": 10,
            "uncached": 0,
            "output": 0,
            "hitRate": pytest.approx(100 / 110),
            "gapS": None,
            "ttlS": 300,
            "model": "claude-opus-5",
            "cause": "session start",
            "timestamp": "2026-08-17T00:00:00Z",
        }

    def test_session_without_a_companion_dir_reports_no_subagents(self, projects_dir):
        jsonl_file = _write_session(projects_dir, [make_assistant_record("r1", "m1")])
        assert build_cache_stats(jsonl_file)["subagents"] == []

    def test_subagent_block_mirrors_the_session_payload_shape(self, projects_dir):
        agent_records = [make_assistant_record("ar1", "am1")]
        meta = {"agentType": "python-style-reviewer", "description": "Review"}
        jsonl_file = _write_session_with_agents(projects_dir, [("a1", agent_records, meta)])
        stats = build_cache_stats(jsonl_file)
        assert stats["subagents"] == [
            {
                "agentId": "a1",
                "agentType": "python-style-reviewer",
                "description": "Review",
                "turns": [
                    {
                        "cacheRead": 100,
                        "cacheCreation": 10,
                        "uncached": 0,
                        "output": 0,
                        "hitRate": pytest.approx(100 / 110),
                        "gapS": None,
                        "ttlS": 300,
                        "model": "claude-opus-5",
                        "cause": "session start",
                        "timestamp": "2026-08-17T00:00:00Z",
                    }
                ],
                "session": {
                    "turnCount": 1,
                    "cacheRead": 100,
                    "cacheCreation": 10,
                    "uncached": 0,
                    "output": 0,
                    "hitRate": pytest.approx(100 / 110),
                },
                "skipped": 0,
            }
        ]


class TestReadAgentLabels:
    @pytest.mark.parametrize(
        "meta, expected",
        [
            ({"agentType": "reviewer", "description": "Review it"}, ("reviewer", "Review it")),
            ({"agentType": "reviewer"}, ("reviewer", None)),
            ({"agentType": 7, "description": ["not a string"]}, (None, None)),
            (None, (None, None)),
            ("{not json", (None, None)),
            ("[1, 2]", (None, None)),
        ],
    )
    def test_labels_are_read_or_degrade_to_none(self, projects_dir, meta, expected):
        jsonl_file = _write_session_with_agents(projects_dir, [("a1", [], meta)])
        agent_file = jsonl_file.parent / "sess" / "subagents" / "agent-a1.jsonl"
        assert _read_agent_labels(agent_file) == expected


class TestBuildSubagents:
    def test_companion_dir_without_subagents_dir_yields_nothing(self, projects_dir):
        jsonl_file = _write_session(projects_dir, [])
        (jsonl_file.parent / "sess").mkdir()
        assert _build_subagents(jsonl_file) == []

    def test_non_agent_files_in_the_subagents_dir_are_ignored(self, projects_dir):
        jsonl_file = _write_session_with_agents(projects_dir, [("a1", [], None)])
        (jsonl_file.parent / "sess" / "subagents" / "notes.jsonl").write_text("{}\n")
        assert [a["agentId"] for a in _build_subagents(jsonl_file)] == ["a1"]

    def test_agents_are_ordered_by_first_turn_with_turnless_agents_last(self, projects_dir):
        late = make_assistant_record("ar1", "am1", timestamp="2026-08-17T00:05:00Z")
        early = make_assistant_record("br1", "bm1", timestamp="2026-08-17T00:01:00Z")
        jsonl_file = _write_session_with_agents(
            projects_dir,
            [("a", [late], None), ("b", [early], None), ("c", [], None)],
        )
        assert [a["agentId"] for a in _build_subagents(jsonl_file)] == ["b", "a", "c"]

    def test_each_agent_starts_its_own_cache_lifeline(self, projects_dir):
        # Both agents open with a miss of their own, unaffected by the other's traffic.
        agent_records = [
            make_assistant_record("ar1", "am1", usage=_CACHE_MISS_USAGE),
            make_assistant_record("ar2", "am2", timestamp="2026-08-17T00:01:00Z"),
        ]
        jsonl_file = _write_session_with_agents(
            projects_dir,
            [("a1", agent_records, None), ("a2", agent_records, None)],
        )
        subagents = _build_subagents(jsonl_file)
        assert [[t["cause"] for t in a["turns"]] for a in subagents] == [
            ["session start", "-"],
            ["session start", "-"],
        ]
        assert [a["session"]["hitRate"] for a in subagents] == [
            pytest.approx(100 / 10109),
            pytest.approx(100 / 10109),
        ]

    def test_missing_meta_file_leaves_the_labels_null_but_keeps_the_turns(self, projects_dir):
        jsonl_file = _write_session_with_agents(
            projects_dir,
            [("01Rj", [make_assistant_record("ar1", "am1")], None)],
        )
        agent = _build_subagents(jsonl_file)[0]
        assert (agent["agentId"], agent["agentType"], agent["description"]) == ("01Rj", None, None)
        assert agent["session"]["turnCount"] == 1
