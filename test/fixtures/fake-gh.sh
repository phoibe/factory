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
  "repo clone") mkdir -p "$4" && git -C "$4" init -q -b main && printf '{}' > "$4/package.json" && git -C "$4" add -A && git -C "$4" -c user.name=t -c user.email=t@t commit -qm init && git -C "$4" remote add origin "$FAKE_REMOTE"
    # FAKE_ALREADY_INSTALLED: the repository already holds every factory file, as the template serves them.
    if [ -n "${FAKE_ALREADY_INSTALLED:-}" ]; then
      for f in .github/workflows/factory.yml .github/workflows/factory-sync.yml .github/ISSUE_TEMPLATE/feature.yml .github/ISSUE_TEMPLATE/bug.yml .github/ISSUE_TEMPLATE/project.yml .github/ISSUE_TEMPLATE/question.yml .github/ISSUE_TEMPLATE/config.yml; do
        mkdir -p "$4/$(dirname "$f")"; "$0" api -H 'Accept: application/vnd.github.raw' "repos/phoibe/factory-template/contents/$f" > "$4/$f"
      done
      printf '{}' > "$4/factory.config.json"; printf 'Read .factory/AGENT.md first.\n' > "$4/CLAUDE.md"
      git -C "$4" add -A && git -C "$4" -c user.name=t -c user.email=t@t commit -qm factory
    fi
    # FAKE_PUSH_REJECTED: the default branch is protected, GitHub refuses the push.
    # FAKE_PUSH_REJECTED=other: refused for another reason (rights, network…).
    if [ -n "${FAKE_PUSH_REJECTED:-}" ]; then
      msg="remote: error: GH006: Protected branch update failed for refs/heads/main."
      [ "$FAKE_PUSH_REJECTED" = other ] && msg="remote: Permission to phoibe/mon-appli.git denied to phoibe."
      printf '#!/bin/sh\necho "%s" >&2\nexit 1\n' "$msg" > "$FAKE_REMOTE/hooks/pre-receive"
      chmod +x "$FAKE_REMOTE/hooks/pre-receive"
    fi ;;
  "api user/installations") echo "${FAKE_INSTALLATIONS:-42 all}" ;;
  "secret set") cat > /dev/null ;;
  "repo archive") [ -n "${FAKE_ARCHIVE_FAILS:-}" ] && exit 1; exit 0 ;;
  "workflow run") touch "$FAKE_GH_LOG.dispatched" ;;
  # An old run (6) exists until a workflow is dispatched; then the new one (7) appears, one listing later.
  # GitHub is slow to list a freshly dispatched run: the first listing after it still shows the old one.
  "run list") if [ -f "$FAKE_GH_LOG.dispatched" ] && [ -f "$FAKE_GH_LOG.listed" ]; then echo 7; else [ -f "$FAKE_GH_LOG.dispatched" ] && touch "$FAKE_GH_LOG.listed"; echo 6; fi ;;
  "run watch") [ "$3" = "${FAKE_RUN_WATCH_FAILS:-}" ] && exit 1; exit 0 ;;
  # habitudes is framed; FAKE_FRAMED lists other framed repos (an issue factory:project exists).
  "issue list") case " phoibe/habitudes ${FAKE_FRAMED:-} " in *" $4 "*) echo 5 ;; esac ;;
  "issue create") echo "https://github.com/phoibe/x/issues/1" ;;
  "repo list") printf 'phoibe/factory\nphoibe/habitudes\nphoibe/vieux-site\n' ;;
  *)
    case "$*" in
      *phoibe/habitudes/contents/factory.config.json*) echo '{}' ;;
      *phoibe/factory-template/contents/factory.config.json*) echo '{}' ;;
      *contents/factory.config.json*) case " ${FAKE_INSTALLED:-} " in *" ${2#repos/} "*) echo '{}'; exit 0 ;; esac; [ -f "$FAKE_GH_LOG.created" ] && echo '{}' || exit 1 ;;
      # Private unless the repository is listed in FAKE_PUBLIC.
      *"--jq .private"*) case " ${FAKE_PUBLIC:-} " in *" ${2#repos/} "*) echo false ;; *) echo true ;; esac ;;
      *contents/CLAUDE.md*) printf '# Instructions for Claude\n\nRead .factory/AGENT.md first.\n' ;;
      *contents/*) echo "content of ${*##*contents/}" ;;
    esac ;;
esac
