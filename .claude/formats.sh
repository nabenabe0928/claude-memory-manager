#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR:-.}"

output=$(bash formats.sh) 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  jq -nc --arg reason "Formatter violations found:
$output" '{"decision": "block", "reason": $reason}'
fi
