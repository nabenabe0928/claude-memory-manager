#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR:-.}"

output=$(bash tests.sh) 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  jq -nc --arg reason "Test failures found:
$output" '{"decision": "block", "reason": $reason}'
fi
