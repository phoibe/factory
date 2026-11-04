#!/usr/bin/env bash
# Stand-in for the GitHub CLI used by test/factory-sh.test.mjs: logs each call and answers like GitHub.
echo "gh $*" >> "$FAKE_GH_LOG"
case "$1 $2" in
  "auth status") exit 0 ;;
  "api user") echo phoibe ;;
  "repo view")
    if [ "${3:-}" = phoibe/nouveau-projet ] && [ ! -f "$FAKE_GH_LOG.created" ]; then exit 1; fi
    case " $* " in *defaultBranchRef*) echo main ;; esac ;;
  "repo create") touch "$FAKE_GH_LOG.created" ;;
  "repo clone") mkdir -p "$4" && git -C "$4" init -q -b main && printf '{}' > "$4/package.json" && git -C "$4" add -A && git -C "$4" -c user.name=t -c user.email=t@t commit -qm init && git -C "$4" remote add origin "$FAKE_REMOTE" ;;
  "api user/installations") echo "42 all" ;;
  "secret set") cat > /dev/null ;;
  "workflow run") ;;
  "run list") echo 7 ;;
  "run watch") ;;
  "issue create") echo "https://github.com/phoibe/x/issues/1" ;;
  *)
    case "$*" in
      *contents/CLAUDE.md*) printf '# Instructions for Claude\n\nRead .factory/AGENT.md first.\n' ;;
      *contents/*) echo "content of ${*##*contents/}" ;;
    esac ;;
esac
