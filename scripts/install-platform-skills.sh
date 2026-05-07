#!/usr/bin/env bash
# Install the PiB platform-API skills into ~/Cowork/.claude/skills/ as
# symlinks, so they're discoverable from any Cowork project (Claude Code
# walks .claude/skills upward from cwd).
#
# Idempotent — safe to re-run. Symlinks always point back to the canonical
# location inside the partnersinbiz-web repo so edits are git-versioned.
#
# Usage:
#   bash partnersinbiz-web/scripts/install-platform-skills.sh
set -euo pipefail

SRC="/Users/peetstander/Cowork/Partners in Biz — Client Growth/partnersinbiz-web/.claude/skills"
DEST="/Users/peetstander/Cowork/.claude/skills"

# Only the platform-API skills get exposed Cowork-wide. Engineering
# playbook skills (marketing, software-development) stay codebase-local —
# they're for working ON the partnersinbiz-web codebase, not on clients.
PLATFORM_SKILLS=(
  analytics
  billing-finance
  client-manager
  crm-sales
  email-outreach
  platform-ops
  project-management
  properties
  seo-sprint-manager
  social-media-manager
)

mkdir -p "$DEST"

for skill in "${PLATFORM_SKILLS[@]}"; do
  source_path="$SRC/$skill"
  dest_path="$DEST/$skill"

  if [ ! -d "$source_path" ]; then
    echo "skip $skill — source missing at $source_path"
    continue
  fi

  if [ -L "$dest_path" ]; then
    # Existing symlink — refresh in case the target moved
    rm "$dest_path"
    ln -s "$source_path" "$dest_path"
    echo "refreshed $skill"
  elif [ -e "$dest_path" ]; then
    echo "skip $skill — non-symlink already exists at $dest_path (not touching it)"
  else
    ln -s "$source_path" "$dest_path"
    echo "linked $skill"
  fi
done

echo
echo "Done. From any Cowork project these skills now activate via Claude Code skill discovery."
