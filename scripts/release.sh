#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Liswitch Release Packaging and Verification Script for GNOME Shell 51

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UUID="liswitch@local"
PACK_FILE="${ROOT_DIR}/${UUID}.shell-extension.zip"
PACK_COMPAT_FILE="${ROOT_DIR}/${UUID}.zip"

cd "${ROOT_DIR}"

echo "============================================================"
echo " Liswitch Release Packaging & Verification (GNOME Shell 51)"
echo "============================================================"

# Step 1: Toolchain dependency check
echo "==> [1/7] Verifying required build tools..."
REQUIRED_TOOLS=("gnome-extensions" "glib-compile-schemas" "msgfmt" "node" "unzip" "sha256sum")
for tool in "${REQUIRED_TOOLS[@]}"; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "ERROR: Required tool '${tool}' is not installed or not in PATH." >&2
        exit 1
    fi
done
echo "    All required build tools found."

# Step 2: Validate GSettings schema
echo "==> [2/7] Strictly validating GSettings schema..."
glib-compile-schemas --strict --dry-run schemas/
glib-compile-schemas schemas/
echo "    Schema XML is valid and strictly compliant."

# Step 3: Linting and static syntax analysis
echo "==> [3/7] Linting and checking JavaScript syntax..."
if command -v eslint >/dev/null 2>&1; then
    eslint .
else
    echo "    (eslint not in PATH; validating all files via node --check)"
    for f in extension.js prefs.js indicator.js hotkeys.js windowMemory.js osd.js textCorrection.js src/*.js tests/*.js; do
        node --check "${f}"
    done
fi
echo "    All JavaScript source files passed syntax check."

# Step 4: Run pure-GJS test suite
echo "==> [4/7] Running pure-GJS test suite..."
make unit-test
echo "    All unit tests, benchmarks, stress tests, and resilience tests PASSED."

# Step 5: Compile translation catalogs
echo "==> [5/7] Compiling gettext translation catalogs..."
make translations
echo "    Translations compiled successfully."

# Step 6: Package the extension bundle
echo "==> [6/7] Packaging extension bundle via gnome-extensions pack..."
rm -f "${PACK_FILE}" "${PACK_COMPAT_FILE}"

gnome-extensions pack --force \
    --podir=po \
    --gettext-domain=liswitch \
    --extra-source=stylesheet.css \
    --extra-source=LICENSE \
    --extra-source=indicator.js \
    --extra-source=hotkeys.js \
    --extra-source=windowMemory.js \
    --extra-source=osd.js \
    --extra-source=textCorrection.js \
    --extra-source=src \
    --out-dir="${ROOT_DIR}" \
    "${ROOT_DIR}"

if [ ! -f "${PACK_FILE}" ]; then
    if [ -f "${PACK_COMPAT_FILE}" ]; then
        cp -f "${PACK_COMPAT_FILE}" "${PACK_FILE}"
    else
        echo "ERROR: Packaging failed, ${PACK_FILE} not created." >&2
        exit 1
    fi
fi
cp -f "${PACK_FILE}" "${PACK_COMPAT_FILE}"
echo "    Archive created: $(basename "${PACK_FILE}") ($(stat -c%s "${PACK_FILE}") bytes)"

# Step 7: Inspect package contents against EGO guidelines
echo "==> [7/7] Auditing package contents against EGO submission rules..."

# Check required files inside archive
REQUIRED_ENTRIES=(
    "metadata.json"
    "extension.js"
    "prefs.js"
    "stylesheet.css"
    "LICENSE"
    "schemas/org.gnome.shell.extensions.liswitch.gschema.xml"
    "locale/ru/LC_MESSAGES/liswitch.mo"
    "locale/kk/LC_MESSAGES/liswitch.mo"
    "src/log.js"
    "src/inputSourceService.js"
    "src/indicator.js"
    "src/hotkeys.js"
    "src/hotkeyManager.js"
    "src/windowMemory.js"
    "src/windowMemoryService.js"
    "src/osd.js"
    "src/osdService.js"
    "src/textTranslator.js"
    "src/textCorrection.js"
)

ZIP_ENTRIES="$(unzip -Z -1 "${PACK_FILE}")"

for entry in "${REQUIRED_ENTRIES[@]}"; do
    if ! echo "${ZIP_ENTRIES}" | grep -q "^${entry}$"; then
        echo "ERROR: Missing required file in package: ${entry}" >&2
        exit 1
    fi
done

# Check forbidden files / patterns in archive
FORBIDDEN_PATTERNS=(
    "node_modules"
    "\.git"
    "tests/"
    "docs/"
    "scripts/"
    "Makefile"
    "\.pot?$"
    "\.py$"
    "\.sh$"
    "\.swp$"
    "\.DS_Store"
    "\.editorconfig"
    "\.eslintrc"
    "eslint\.config"
    "package\.json"
    "package-lock\.json"
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    MATCHES="$(echo "${ZIP_ENTRIES}" | grep -E "${pattern}" || true)"
    if [ -n "${MATCHES}" ]; then
        echo "ERROR: Package contains forbidden entries matching pattern '${pattern}':" >&2
        echo "${MATCHES}" >&2
        exit 1
    fi
done

# Verify metadata.json values from within archive
TEMP_META_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_META_DIR}"' EXIT

unzip -q -j "${PACK_FILE}" metadata.json -d "${TEMP_META_DIR}"
META_FILE="${TEMP_META_DIR}/metadata.json"

SHELL_VER="$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(m["shell-version"].join(","));' "${META_FILE}")"
UUID_VAL="$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(m.uuid);' "${META_FILE}")"
VERSION_VAL="$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(typeof m.version === "number" ? m.version : "INVALID");' "${META_FILE}")"
VERSION_NAME="$(node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(m["version-name"]);' "${META_FILE}")"

if [ "${SHELL_VER}" != "51" ]; then
    echo "ERROR: metadata.json shell-version must be strictly ['51'], found: [${SHELL_VER}]" >&2
    exit 1
fi

if [ "${UUID_VAL}" != "${UUID}" ]; then
    echo "ERROR: metadata.json uuid mismatch: expected '${UUID}', found '${UUID_VAL}'" >&2
    exit 1
fi

if [ "${VERSION_VAL}" = "INVALID" ]; then
    echo "ERROR: metadata.json 'version' must be an integer, found: ${VERSION_VAL}" >&2
    exit 1
fi

if [ "${VERSION_NAME}" != "1.0.0" ]; then
    echo "ERROR: metadata.json 'version-name' must be '1.0.0', found: ${VERSION_NAME}" >&2
    exit 1
fi

echo "    Package metadata verified: UUID=${UUID_VAL}, version=${VERSION_VAL}, version-name=${VERSION_NAME}, shell-version=[${SHELL_VER}]"
echo "    No forbidden or uncompiled files detected in archive."

echo ""
echo "============================================================"
echo " RELEASE BUNDLE VERIFICATION SUCCESSFUL!"
echo "============================================================"
echo "Package File:    ${PACK_FILE}"
echo "Compat File:     ${PACK_COMPAT_FILE}"
echo "File Size:       $(stat -c%s "${PACK_FILE}") bytes"
echo "SHA-256:         $(sha256sum "${PACK_FILE}" | awk '{print $1}')"
echo "MD5:             $(md5sum "${PACK_FILE}" | awk '{print $1}')"
echo "============================================================"
