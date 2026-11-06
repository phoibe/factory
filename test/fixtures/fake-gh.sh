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
  "api user/installations") echo "${FAKE_INSTALLATIONS:-42 all}" ;;
  "secret set") cat > /dev/null ;;
  "repo archive") [ -n "${FAKE_ARCHIVE_FAILS:-}" ] && exit 1; exit 0 ;;
  "workflow run") touch "$FAKE_GH_LOG.dispatched" ;;
  # An old run (6) exists until a workflow is dispatched; then the new one (7) appears, one listing later.
  # GitHub is slow to list a freshly dispatched run: the first listing after it still shows the old one.
  "run list") if [ -f "$FAKE_GH_LOG.dispatched" ] && [ -f "$FAKE_GH_LOG.listed" ]; then echo 7; else [ -f "$FAKE_GH_LOG.dispatched" ] && touch "$FAKE_GH_LOG.listed"; echo 6; fi ;;
  "run watch") [ "$3" = "${FAKE_RUN_WATCH_FAILS:-}" ] && exit 1; exit 0 ;;
  "issue create") echo "https://github.com/phoibe/x/issues/1" ;;
  "repo list") printf 'phoibe/factory\nphoibe/habitudes\nphoibe/vieux-site\n' ;;
  *)
    case "$*" in
      *phoibe/habitudes/contents/factory.config.json*) echo '{}' ;;
      *phoibe/factory-template/contents/factory.config.json*) echo '{}' ;;
      *contents/factory.config.json*) [ -f "$FAKE_GH_LOG.created" ] && echo '{}' || exit 1 ;;
      *contents/CLAUDE.md*) printf '# Instructions for Claude\n\nRead .factory/AGENT.md first.\n' ;;
      *contents/*) echo "content of ${*##*contents/}" ;;
    esac ;;
esac
