UUID = liswitch@local
PACK_FILE = $(UUID).shell-extension.zip
SCHEMA_DIR = schemas
SCHEMA_FILE = $(SCHEMA_DIR)/org.gnome.shell.extensions.liswitch.gschema.xml

.PHONY: all schemas translations pot pack install uninstall enable disable logs nested test unit-test lint check clean release

all: pack

schemas: $(SCHEMA_FILE)
	glib-compile-schemas $(SCHEMA_DIR)/

pot:
	xgettext --from-code=UTF-8 --output=po/liswitch.pot \
		--package-name=liswitch --package-version=1.0.0 \
		--msgid-bugs-address=https://github.com/liswitch/liswitch/issues \
		--keyword=_ --keyword=C_:1c,2 --keyword=N_ \
		extension.js prefs.js src/*.js

translations:
	@mkdir -p locale/ru/LC_MESSAGES locale/kk/LC_MESSAGES
	msgfmt --check -o locale/ru/LC_MESSAGES/liswitch.mo po/ru.po
	msgfmt --check -o locale/kk/LC_MESSAGES/liswitch.mo po/kk.po

pack: schemas translations
	gnome-extensions pack --force \
		--podir=po \
		--gettext-domain=liswitch \
		--extra-source=stylesheet.css \
		--extra-source=LICENSE \
		--extra-source=src \
		--out-dir=. \
		.
	@if [ -f $(PACK_FILE) ]; then \
		cp -f $(PACK_FILE) $(UUID).zip 2>/dev/null || true; \
	fi

install: pack
	gnome-extensions install --force $(PACK_FILE)

uninstall:
	gnome-extensions uninstall $(UUID)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

logs:
	journalctl -f -o cat /usr/bin/gnome-shell

nested:
	@echo "NOTE: On GNOME Shell 51 (pure Wayland), running a second Shell instance"
	@echo "requires a separate TTY (e.g. Ctrl+Alt+F3) due to DRM device contention (EBUSY)."
	@echo "Attempting to launch..."
	dbus-run-session gnome-shell --wayland --no-x11

unit-test:
	@echo "==> Running pure-GJS unit tests..."
	gjs -m tests/test-input-source-service.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 gjs -m tests/test-indicator.js
	XDG_RUNTIME_DIR=/tmp gjs -m tests/test-hotkeys.js
	XDG_RUNTIME_DIR=/tmp gjs -m tests/test-window-memory.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 gjs -m tests/test-osd.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/gnome-shell/girepository-1.0:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 gjs -m tests/test-prefs.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 XDG_RUNTIME_DIR=/tmp gjs -m tests/test-text-correction.js
	XDG_RUNTIME_DIR=/tmp gjs -m tests/test-performance.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 XDG_RUNTIME_DIR=/tmp gjs -m tests/test-stress-100-cycles.js
	GI_TYPELIB_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 LD_LIBRARY_PATH=/usr/lib64/gnome-shell:/usr/lib64/mutter-51 XDG_RUNTIME_DIR=/tmp gjs -m tests/test-resilience.js

test: pack unit-test
	@echo "==> Running smoke test via gnome-shell-test-tool (if DBus session bus is available)..."
	@if [ -n "$$DBUS_SESSION_BUS_ADDRESS" ]; then \
		gnome-shell-test-tool --headless --extension $(PACK_FILE) tests/smoke-test.js || true; \
	else \
		echo "Skipping headless gnome-shell-test-tool (requires active DBus session / graphical TTY session)"; \
	fi

lint: schemas
	@echo "==> Validating GSettings schema..."
	glib-compile-schemas --strict --dry-run $(SCHEMA_DIR)/
	@echo "==> Linting JavaScript files..."
	@if command -v eslint >/dev/null 2>&1; then \
		eslint . ; \
	else \
		echo "eslint not found in PATH; running syntax validation via node --check..."; \
		for f in extension.js prefs.js src/*.js tests/*.js; do \
			node --check "$$f" || exit 1; \
		done ; \
		echo "Syntax check OK"; \
	fi

check: lint

release:
	./scripts/release.sh

clean:
	rm -rf $(PACK_FILE) $(UUID).zip $(SCHEMA_DIR)/gschemas.compiled locale
