import difflib
import json
import os


def format_agent(input_dict: dict) -> str:
    lines = []

    top_keys = ["subagent_type", "run_in_background", "model", "isolation"]
    for key in top_keys:
        if key in input_dict:
            lines.append(f"- {key}: {input_dict[key]}")

    if lines:
        lines.append("")

    lines.append("# Description")
    lines.append(input_dict.get("description", ""))
    lines.append("")
    lines.append("# Prompt")
    lines.append(input_dict.get("prompt", ""))

    return "\n".join(lines)


_KNOWN_OPTION_KEYS = {"label", "description"}
_KNOWN_QUESTION_KEYS = {"question", "header", "options"}


def _format_options(options):
    lines = []
    for opt in options:
        label = opt.get("label", "")
        desc = opt.get("description", "")
        if desc:
            lines.append(f"- {label}: {desc}")
        else:
            lines.append(f"- {label}")
        extra = {k: v for k, v in opt.items() if k not in _KNOWN_OPTION_KEYS}
        for k, v in extra.items():
            lines.append(f"  - {k}: {v}")
    return lines


def _format_misc(question_dict):
    extra = {k: v for k, v in question_dict.items() if k not in _KNOWN_QUESTION_KEYS}
    if not extra:
        return []
    lines = ["", "## Misc."]
    for k, v in extra.items():
        lines.append(f"- {k}: {json.dumps(v)}")
    return lines


def format_ask_user_question(input_dict: dict) -> str:
    questions = input_dict.get("questions")
    if not questions:
        return json.dumps(input_dict, indent=2)

    blocks = []
    for i, q in enumerate(questions, 1):
        lines = []
        header = q.get("header", "")
        lines.append(f"# Q{i}({header}): {q.get('question', '')}")
        if "options" in q:
            lines.extend(_format_options(q["options"]))
        lines.extend(_format_misc(q))
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks) + "\n"


def format_edit(input_dict: dict) -> str:
    old_string = input_dict.get("old_string")
    new_string = input_dict.get("new_string")

    if old_string is None or new_string is None:
        return json.dumps(input_dict, indent=2)

    file_path = input_dict.get("file_path", "")
    replace_all = input_dict.get("replace_all", False)
    filename = os.path.basename(file_path)

    old_lines = old_string.splitlines(keepends=True)
    new_lines = new_string.splitlines(keepends=True)

    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile=filename,
        tofile=filename,
    )

    header = f"- Edit: {file_path}\n- Replace All: {str(replace_all).lower()}"
    diff_text = "".join(diff)

    return f"{header}\n\n{diff_text}"


def format_bash(input_dict: dict) -> str:
    description = input_dict.get("description", "Run command")
    timeout = input_dict.get("timeout")
    command = input_dict.get("command", "")
    timeout_str = str(timeout) if timeout is not None else "none"
    return f"{description} (timeout: {timeout_str})\n```shell\n{command}\n```"


TOOL_FORMATTERS = {
    "Agent": format_agent,
    "AskUserQuestion": format_ask_user_question,
    "Edit": format_edit,
    "Bash": format_bash,
}


def format_tool_input(name: str, input_dict: dict) -> str:
    formatter = TOOL_FORMATTERS.get(name)
    if formatter:
        return formatter(input_dict)
    return json.dumps(input_dict, indent=2, ensure_ascii=False)
