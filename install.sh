#!/usr/bin/env bash
#
# GitHub Copilot for Obsidian — Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/cheeragpatel/copilot-obsidian/main/install.sh | bash
#
#   Or with a specific vault path:
#   curl -fsSL https://raw.githubusercontent.com/cheeragpatel/copilot-obsidian/main/install.sh | bash -s -- /path/to/vault
#
set -euo pipefail

REPO="cheeragpatel/copilot-obsidian"
PLUGIN_ID="github-copilot-chat"
FILES="main.js manifest.json styles.css"

# ── Helpers ──────────────────────────────────────────────────

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

die() { red "Error: $*" >&2; exit 1; }

# ── Find the vault ──────────────────────────────────────────

find_vaults() {
  local search_dirs=()
  if [[ -d "$HOME/Documents/Obsidian" ]]; then
    search_dirs+=("$HOME/Documents/Obsidian")
  fi
  if [[ -d "$HOME/Documents" ]]; then
    search_dirs+=("$HOME/Documents")
  fi
  search_dirs+=("$HOME")

  for dir in "${search_dirs[@]}"; do
    find "$dir" -maxdepth 4 -type d -name ".obsidian" 2>/dev/null | while read -r obsdir; do
      dirname "$obsdir"
    done
  done | sort -u | head -20
}

VAULT_PATH="${1:-}"

if [[ -z "$VAULT_PATH" ]]; then
  bold "Looking for Obsidian vaults..."
  VAULTS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && VAULTS+=("$line")
  done < <(find_vaults)

  if [[ ${#VAULTS[@]} -eq 0 ]]; then
    die "No Obsidian vaults found. Please provide the vault path as an argument:
    bash install.sh /path/to/your/vault"
  elif [[ ${#VAULTS[@]} -eq 1 ]]; then
    VAULT_PATH="${VAULTS[0]}"
    echo "Found vault: $VAULT_PATH"
  else
    echo "Found multiple vaults:"
    for i in "${!VAULTS[@]}"; do
      echo "  $((i + 1)). ${VAULTS[$i]}"
    done
    echo ""
    read -rp "Select a vault (1-${#VAULTS[@]}): " choice
    if [[ "$choice" -ge 1 && "$choice" -le ${#VAULTS[@]} ]] 2>/dev/null; then
      VAULT_PATH="${VAULTS[$((choice - 1))]}"
    else
      die "Invalid selection"
    fi
  fi
fi

# Validate
[[ -d "$VAULT_PATH/.obsidian" ]] || die "'$VAULT_PATH' is not an Obsidian vault (no .obsidian directory)"

PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"

# ── Get latest release ──────────────────────────────────────

bold "Fetching latest release..."
RELEASE_URL="https://api.github.com/repos/$REPO/releases/latest"
RELEASE_JSON=$(curl -fsSL "$RELEASE_URL" 2>/dev/null) || die "Could not fetch release info. Is the repo public?"

TAG=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
[[ -n "$TAG" ]] || die "No releases found. Ask the repo owner to create a release."

echo "Latest version: $TAG"

# ── Download and install ────────────────────────────────────

mkdir -p "$PLUGIN_DIR"

bold "Downloading plugin files..."
for file in $FILES; do
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/$file"
  echo "  ↓ $file"
  curl -fsSL "$DOWNLOAD_URL" -o "$PLUGIN_DIR/$file" || die "Failed to download $file"
done

# ── Done ────────────────────────────────────────────────────

echo ""
green "✓ Installed GitHub Copilot for Obsidian ($TAG)"
echo ""
echo "Next steps:"
echo "  1. Open Obsidian"
echo "  2. Go to Settings → Community plugins"
echo "  3. Turn off 'Restricted mode' if prompted"
echo "  4. Enable 'GitHub Copilot'"
echo "  5. Open the sidebar: Cmd/Ctrl+P → 'Open Copilot Chat'"
echo ""
bold "Prerequisites:"
echo "  • GitHub Copilot CLI: npm install -g @github/copilot"
echo "  • Then authenticate:  copilot auth login"
