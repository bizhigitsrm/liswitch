# Liswitch (liswitch@local)

Advanced input source and keyboard layout switcher for GNOME Shell 51 (Wayland).

## Features (Roadmap)
- Top panel indicator for active keyboard layout with interactive menu
- Per-window and per-application layout memory persistence
- Customizable layout switching keybindings with safe system shortcut management
- Visual OSD popup notification on layout change
- Modern Libadwaita preferences dialog

## Requirements
- GNOME Shell 51
- GJS 1.90+
- Pure Wayland session

## Development & Build Commands

- **Build GSettings schema**:
  ```bash
  make schemas
  ```

- **Run linter and schema validation**:
  ```bash
  make lint
  ```

- **Package extension bundle**:
  ```bash
  make pack
  ```

- **Install extension locally**:
  ```bash
  make install
  ```

- **Enable / Disable extension**:
  ```bash
  make enable
  make disable
  ```

- **Run in nested test session**:
  ```bash
  make nested
  ```

- **One-command dev workflow**:
  ```bash
  ./scripts/dev-run.sh
  ```

- **View GNOME Shell logs**:
  ```bash
  make logs
  ```

## License
GPL-2.0-or-later (see [LICENSE](LICENSE)).
