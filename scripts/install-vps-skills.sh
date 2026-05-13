#!/usr/bin/env bash
# Install the PiB platform-API skills into a Hermes profile's .claude/skills/
# directory on the VPS. Mirrors what install-platform-skills.sh does on the Mac.
#
# Symlinks point back to the cloned partnersinbiz-web repo at /var/lib/hermes/
# so a `git pull` in that repo refreshes every linked profile automatically.
#
# Idempotent — safe to re-run on every git pull.
#
# Usage:
#   sudo -u hermes bash /var/lib/hermes/partnersinbiz-web/scripts/install-vps-skills.sh <profile-name>
#
# Example:
#   sudo -u hermes bash /var/lib/hermes/partnersinbiz-web/scripts/install-vps-skills.sh pip
#
# Run with no args to refresh every profile under /var/lib/hermes/profiles/.
set -euo pipefail

SRC="/var/lib/hermes/partnersinbiz-web/.claude/skills"
PROFILE_ROOT="/var/lib/hermes/profiles"

# Keep this list in sync with install-platform-skills.sh on the Mac. These are
# the platform-API skills that every PiB agent needs.
PLATFORM_SKILLS=(
  analytics
  billing-finance
  client-manager
  content-engine
  crm-sales
  email-outreach
  platform-ops
  project-management
  properties
  seo-sprint-manager
  social-media-manager
)

if [ ! -d "$SRC" ]; then
  echo "FATAL: source skills dir missing at $SRC" >&2
  echo "Have you cloned partnersinbiz-web to /var/lib/hermes/partnersinbiz-web?" >&2
  exit 1
fi

install_for_profile() {
  local profile="$1"
  local dest="$PROFILE_ROOT/$profile/.claude/skills"

  if [ ! -d "$PROFILE_ROOT/$profile" ]; then
    echo "skip $profile — profile dir missing"
    return
  fi

  mkdir -p "$dest"

  for skill in "${PLATFORM_SKILLS[@]}"; do
    local source_path="$SRC/$skill"
    local dest_path="$dest/$skill"

    if [ ! -d "$source_path" ]; then
      echo "  skip $skill — source missing at $source_path"
      continue
    fi

    if [ -L "$dest_path" ]; then
      rm "$dest_path"
      ln -s "$source_path" "$dest_path"
      echo "  refreshed $profile/$skill"
    elif [ -e "$dest_path" ]; then
      echo "  skip $profile/$skill — non-symlink already exists (leaving it alone)"
    else
      ln -s "$source_path" "$dest_path"
      echo "  linked $profile/$skill"
    fi
  done
}

if [ "$#" -eq 0 ]; then
  echo "Refreshing skills for every profile under $PROFILE_ROOT"
  for profile_dir in "$PROFILE_ROOT"/*/; do
    profile=$(basename "$profile_dir")
    echo "→ $profile"
    install_for_profile "$profile"
  done
else
  for profile in "$@"; do
    echo "→ $profile"
    install_for_profile "$profile"
  done
fi

echo
echo "Done. Skills are loaded lazily by Hermes at session start — no service restart required."
