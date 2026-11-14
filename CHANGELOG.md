# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-14

### Added
- **Top Panel Indicator (`F1`)**:
  - Independent status area button with configurable position and layout label formatting (`short`, `uppercase`, `lowercase`, `full`).
  - Interactive popup menu listing all configured input sources with an active source indicator dot.
  - Quick layout switching via mouse click or mouse scroll over the indicator icon.
  - Option to hide the default system keyboard indicator without conflicts.
- **Customizable Keybindings & Conflict Resolution (`F2`)**:
  - Direct global shortcuts for next and previous layout cycling.
  - Dedicated direct-switching shortcuts for input sources 1 through 4.
  - Safe system shortcut conflict management: temporarily releases conflicting shortcuts (such as `Super+Space`) with guaranteed restoration when the extension is disabled.
- **Per-Window & Per-App Layout Memory (`F3`)**:
  - Independent layout persistence per individual application window or per application process.
  - High-performance LRU memory cache (up to 500 entries) running entirely in RAM (~6 µs average switch time).
  - Configurable exclusion list (`excluded-apps`) for applications that should not participate in automatic switching.
- **Visual On-Screen Display Notification (`F4`)**:
  - Centered screen OSD badge displaying active layout code and icon on switch.
  - Configurable display duration (300 ms to 3000 ms).
  - Toggle to enable or suppress OSD during automatic window focus transitions.
  - Full accessibility compliance with GNOME `St.ReducedMotion` (animations automatically disabled when requested).
- **Libadwaita Preferences Window (`F5`)**:
  - Modern preferences dialog following GNOME Human Interface Guidelines (HIG).
  - Organized tabs: Indicator, Hotkeys, Window Memory, Visual OSD, Text Correction, and About.
  - Interactive key combination capture with duplicate conflict detection and default reset buttons.
- **Mistyped Text Layout Correction (`F6`)**:
  - On-demand conversion of the last typed word to the opposite layout via double Left Shift tap (`<Shift_L>` < 400 ms) or custom shortcut (`Shift+Pause`).
  - Direct XKB layout character mapping without external dependencies.
  - Pure in-memory circular ring buffer (max 64 characters) with 3-second inactivity auto-purge.
  - Disabled by default for maximum user privacy and zero disk/log persistence.
- **Internationalization (i18n)**:
  - Complete gettext localization support for English, Russian (`ru`), and Kazakh (`kk`) with 100% string coverage.
- **Quality Assurance & Tooling**:
  - Automated pure-GJS unit test suite covering input sources, hotkeys, window memory, OSD, preferences, and text correction.
  - 100-cycle stress test validating leak-free enable/disable transitions.
  - Automated release packaging and validation script (`scripts/release.sh`).
