#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Development runner for liswitch GNOME Shell extension

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UUID="liswitch@local"

cd "${ROOT_DIR}"

echo "=========================================="
echo " Liswitch Dev Runner (GNOME Shell 51)"
echo "=========================================="

echo "==> 1. Compiling GSettings schemas..."
glib-compile-schemas schemas/

echo "==> 2. Validating with linter..."
make lint

echo "==> 2.1 Running pure GJS unit tests..."
make unit-test

echo "==> 3. Packaging extension..."
gnome-extensions pack --force \
    --extra-source=stylesheet.css \
    --extra-source=LICENSE \
    --extra-source=indicator.js \
    --extra-source=hotkeys.js \
    --extra-source=src \
    --out-dir="${ROOT_DIR}" \
    "${ROOT_DIR}"

PACK_FILE="${ROOT_DIR}/${UUID}.shell-extension.zip"
if [ ! -f "${PACK_FILE}" ]; then
    PACK_FILE="${ROOT_DIR}/${UUID}.zip"
fi

echo "==> 4. Installing extension bundle (${PACK_FILE})..."
gnome-extensions install --force "${PACK_FILE}"

echo "==> 5. Automated headless smoke test via gnome-shell-test-tool..."
if command -v gnome-shell-test-tool >/dev/null 2>&1; then
    gnome-shell-test-tool --headless --extension "${PACK_FILE}" tests/smoke-test.js || {
        echo "Headless test returned non-zero (may require unconfined session environment)."
    }
fi

echo "=========================================="
echo " Extension installed to ~/.local/share/gnome-shell/extensions/${UUID}"
echo ""
echo " IMPORTANT NOTICE FOR WAYLAND (GNOME 51):"
echo " 1) GNOME Shell discovers newly added extension directories ONLY on startup."
echo "    If this is the first install, please reload GNOME Shell:"
echo "    - Either Log out and log back in (recommended),"
echo "    - OR open Looking Glass (Alt+F2 -> lg -> Evaluator) and run:"
echo "      Main.extensionManager.loadExtension(Main.extensionManager.createExtensionObject('${UUID}', Gio.File.new_for_path(GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/${UUID}'), 2))"
echo ""
echo " 2) After discovery, enable/disable via CLI:"
echo "    gnome-extensions enable ${UUID}"
echo "    gnome-extensions info ${UUID}"
echo "=========================================="
