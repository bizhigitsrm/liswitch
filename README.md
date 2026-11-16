# Liswitch (liswitch@local)

[![GNOME Shell 47–51+](https://img.shields.io/badge/GNOME%20Shell-47--51%2B-blue.svg)](https://gitlab.gnome.org/GNOME/gnome-shell)
[![Session](https://img.shields.io/badge/Session-Wayland-success.svg)](https://wayland.freedesktop.org/)
[![License: GPL-2.0-or-later](https://img.shields.io/badge/License-GPL--2.0--or--later-green.svg)](LICENSE)
[![Translations](https://img.shields.io/badge/Translations-en%20%7C%20ru%20%7C%20kk-orange.svg)](po/)

> **Liswitch** is a lightweight, responsive, and robust keyboard layout and input source management extension engineered for **GNOME Shell 47–51+** (with primary focus on **Wayland** sessions).
>
> [English](#english) | [Русский](#русский)

---

## English

### Table of Contents
- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
  - [From extensions.gnome.org](#from-extensionsgnomeorg-recommended)
  - [From Pre-built Zip Package](#from-pre-built-zip-package)
  - [From Source Code](#from-source-code)
- [Enabling the Extension](#enabling-the-extension)
- [Configuration & Preferences](#configuration--preferences)
- [Known Wayland Limitations](#known-wayland-limitations)
- [System Shortcut Conflicts](#system-shortcut-conflicts)
- [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
- [Reporting Bugs & Troubleshooting](#reporting-bugs--troubleshooting)
- [License](#license)

---

### Features

1. **Top Panel Indicator (`F1`)**:
   - Clean, lightweight status area indicator showing the active input source.
   - Configurable label formatting: `short` (e.g. `EN`), `uppercase` (`US`), `lowercase` (`en`), or `full` (`English (US)`).
   - Interactive dropdown popup menu to select any configured layout with an active layout indicator dot.
   - Fast layout switching by scrolling the mouse wheel over the indicator.
   - Safe option to hide the default system keyboard indicator without conflicts.

2. **Customizable Hotkeys (`F2`)**:
   - Independent shortcuts for cyclic layout switching (`Next Layout` and `Previous Layout`).
   - Direct-access keybindings for layouts 1, 2, 3, and 4.
   - Intelligent system conflict manager that safely suspends colliding shortcuts (like `Super+Space`) and automatically restores them upon disabling.

3. **Window & Application Layout Memory (`F3`)**:
   - Independent layout memory per window (`per-window`) or per application (`per-app`).
   - Ultra-fast focus restoration (~6 µs) using an in-memory LRU cache (up to 500 entries).
   - Exclusion list (`excluded-apps`) for terminal emulators, virtual machines, or remote desktop clients.

4. **Visual On-Screen Display (OSD) (`F4`)**:
   - Centered screen notification badge displaying the active layout on switch.
   - Configurable display duration (300 ms to 3000 ms).
   - Toggle to enable or suppress the OSD during automatic focus-driven switches.
   - Fully respects accessibility preferences (`St.ReducedMotion` disables fade animations).

5. **Native Libadwaita Preferences (`F5`)**:
   - Modern preferences window built with Libadwaita following GNOME Human Interface Guidelines.
   - Visual key combination recorder with automatic duplicate detection.

6. **Mistyped Text Layout Correction (`F6`)**:
   - On-demand conversion of the last typed word to the matching layout via double Left Shift tap (`<Shift_L>` < 400 ms) or custom shortcut (e.g. `<Shift>Pause`).
   - In-memory ring buffer (up to 64 characters) with automatic 3-second inactivity wipe.
   - **Disabled by default** for strict privacy: no keystroke logging, no disk writes, and no network access.

---

### Screenshots

<!-- SCREENSHOT_PREFERENCES_PLACEHOLDER: Libadwaita Preferences Window -->
```
+-----------------------------------------------------------------------+
|  [<] Liswitch Preferences                                   [-] [x]   |
+-----------------------------------------------------------------------+
|  ( ) Indicator   (*) Hotkeys   ( ) Memory   ( ) OSD   ( ) Correction  |
|                                                                       |
|  General Switching Shortcuts                                          |
|  Next input source                        [ <Control><Shift>   ]  [x] |
|  Previous input source                    [ Disabled           ]  [+] |
|                                                                       |
|  Direct Layout Shortcuts                                              |
|  Switch to layout 1 (English)             [ <Control><Alt>1    ]  [x] |
|  Switch to layout 2 (Russian)             [ <Control><Alt>2    ]  [x] |
|                                                                       |
|  System Conflicts                                                     |
|  [!] Super+Space is assigned to system layout switching               |
|  [ Override and manage via Liswitch                                ]  |
+-----------------------------------------------------------------------+
```
*(Screenshot placeholder: Libadwaita Preferences dialog)*

<!-- SCREENSHOT_PANEL_OSD_PLACEHOLDER: Panel Indicator & OSD Badge -->
```
Top Panel:
  [ Activities ]                  14:30                  [ EN ] [ (v) ]

OSD Popup (Screen Center):
               +---------------+
               |     [icon]    |
               |       EN      |
               |  English (US) |
               +---------------+
```
*(Screenshot placeholder: Top panel indicator and centered OSD badge)*

---

### Installation

#### From extensions.gnome.org (Recommended)
1. Open the [Liswitch page on extensions.gnome.org](https://extensions.gnome.org/extension/liswitch@local/).
2. Toggle the switch to **ON** and accept the installation prompt.

#### From Pre-built Zip Package
Download `liswitch@local.shell-extension.zip` from the GitHub Releases page:
```bash
gnome-extensions install --force liswitch@local.shell-extension.zip
```

#### From Source Code
Clone the repository and compile using `make`:
```bash
git clone https://github.com/liswitch/liswitch.git
cd liswitch
make pack
make install
```

---

### Enabling the Extension

Because GNOME Shell discovers extensions on user session start, after the **first** installation you must log out and log back in (or restart the session), then enable it via CLI or GUI:

```bash
# Enable via CLI
gnome-extensions enable liswitch@local

# Verify status
gnome-extensions info liswitch@local
```
Or open the **Extensions** (`gnome-extensions-app`) graphical utility and turn on **Liswitch**.

---

### Configuration & Preferences

Open preferences directly from the command line:
```bash
gnome-extensions prefs liswitch@local
```
Or click the Liswitch panel indicator and select **Settings...**.

#### Settings Pages Overview:
- **Indicator**: Toggle panel indicator, customize label format (`short`, `uppercase`, `lowercase`, `full`), toggle mouse scroll switching, and hide the default system indicator.
- **Hotkeys**: Set up cyclic switching (`next`/`previous`), direct layout hotkeys (1–4), and override system shortcut conflicts.
- **Window Memory**: Choose memory mode (`per-app`, `per-window`, or `disabled`), customize per-window restore behavior, and configure the excluded applications list.
- **Visual OSD**: Enable/disable OSD badge, set display duration (ms), and configure behavior on automatic focus transitions.
- **Text Correction**: Enable experimental wrong-layout text translation, toggle double Left Shift trigger, and assign manual correction shortcuts.

---

### Known Wayland Limitations

1. **Security Isolation**: Under pure Wayland, GNOME Shell does not permit client applications to snoop on global input events. All layout switching and hotkey captures are performed strictly by the Mutter compositor.
2. **First-Time Discovery**: GNOME Shell indexes extension directories only during startup. If you install the extension manually from source, a session relogin (or reboot) is required before GNOME Shell recognizes the new UUID.
3. **Terminal Paste Shortcut**: Text correction uses a simulated `Ctrl+V` clipboard paste. In certain terminal emulators (e.g. `gnome-console`, `ptyxis`), the paste shortcut is `Ctrl+Shift+V`; text correction in these windows should be triggered manually.
4. **Password Input Fields**: On Wayland, password fields are protected by client toolkits. Liswitch contains heuristic detectors to skip correction in password and authentication dialogs.

---

### System Shortcut Conflicts

By default, GNOME Shell assigns `Super+Space` and `Shift+Super+Space` to `org.gnome.desktop.wm.keybindings switch-input-source`.
If you configure Liswitch to use conflicting shortcuts:
1. Liswitch can automatically unbind the system shortcut temporarily.
2. When Liswitch is disabled or uninstalled, all modified system keybindings are **strictly restored** to their original values.

---

### Frequently Asked Questions (FAQ)

**Q: Why doesn't Liswitch appear in the Extensions app right after manual installation?**
> **A:** GNOME Shell reads extension folders only during session initialization. Please log out of your GNOME session and log back in.

**Q: Which GNOME Shell versions does Liswitch support?**
> **A:** Liswitch supports **GNOME Shell 47, 48, 49, 50, and 51+** via a feature-detection compatibility layer (`src/compat.js`) that adapts to runtime APIs (`St.ReducedMotion` vs `enable_animations`, `St.BoxLayout` `orientation` vs `vertical`, and `Clutter.Seat` backend resolution) without hardcoded version checks.

**Q: Is the text correction feature safe?**
> **A:** Yes. The feature is **disabled by default**. It keeps at most 64 keystrokes in temporary volatile RAM, automatically flushes after 3 seconds of inactivity, never writes keystrokes to disk, and never sends telemetry.

**Q: How do I exclude an app from layout memory?**
> **A:** Open Preferences -> Window Memory -> Excluded Applications and enter the app's `.desktop` ID or WM_CLASS (e.g., `org.gnome.Console`).

---

### Reporting Bugs & Troubleshooting

If you encounter issues, please collect diagnostic logs:

1. **Enable Debug Mode**:
   ```bash
   gsettings set org.gnome.shell.extensions.liswitch debug true
   ```

2. **Retrieve Logs from `journalctl`**:
   ```bash
   journalctl -b /usr/bin/gnome-shell -o cat | grep -i liswitch > liswitch-debug.log
   ```

3. **Check System Info**:
   ```bash
   gnome-shell --version
   echo $XDG_SESSION_TYPE
   gsettings get org.gnome.desktop.input-sources sources
   ```

4. **Submit an Issue**:
   File a report at [GitHub Issues](https://github.com/liswitch/liswitch/issues) with the collected `liswitch-debug.log` and system details.

---

### License

This project is licensed under the **GNU General Public License v2.0 or later** ([GPL-2.0-or-later](LICENSE)).

---
---

## Русский

### Содержание
- [Возможности](#возможности)
- [Скриншоты](#скриншоты)
- [Установка](#установка)
  - [С сайта extensions.gnome.org](#с-сайта-extensionsgnomeorg-рекомендуется)
  - [Из готового zip-архива](#из-готового-zip-архива)
  - [Из исходного кода](#из-исходного-кода)
- [Включение расширения](#включение-расширения)
- [Настройка параметров](#настройка-параметров)
- [Известные ограничения Wayland](#известные-ограничения-wayland)
- [Конфликты с системными сочетаниями](#конфликты-с-системными-сочетаниями)
- [Часто задаваемые вопросы (FAQ)](#часто-задаваемые-вопросы-faq)
- [Диагностика и отправка отчётов об ошибках](#диагностика-и-отправка-отчётов-об-ошибках)
- [Лицензия](#лицензия)

---

### Возможности

1. **Индикатор в верхней панели (`F1`)**:
   - Лаконичный индикатор активного языка в правой части панели GNOME Shell.
   - Настройка формата отображения: `short` (например, `EN`), `uppercase` (`US`), `lowercase` (`en`), `full` (`English (US)`).
   - Выпадающее меню со списком всех настроенных раскладок и точкой-индикатором активной.
   - Быстрое переключение раскладок вращением колеса мыши над индикатором.
   - Возможность скрыть стандартный системный индикатор клавиатуры без конфликтов.

2. **Гибкие горячие клавиши (`F2`)**:
   - Независимые комбинации клавиш для циклического переключения вперёд и назад.
   - Прямой выбор конкретной раскладки (раскладки 1, 2, 3 и 4) выделенными сочетаниями.
   - Интеллектуальное разрешение конфликтов: временное освобождение системных сочетаний (`Super+Space`) с гарантированным возвратом при отключении расширения.

3. **Память раскладки для окон и приложений (`F3`)**:
   - Независимое запоминание языка ввода для каждого отдельного окна (`per-window`) или для приложения в целом (`per-app`).
   - Мгновенное переключение при смене фокуса (~6 микросекунд) на базе кольцевого LRU-кэша в оперативной памяти (до 500 записей).
   - Список исключений (`excluded-apps`) для терминалов, виртуальных машин и удалённых рабочих столов.

4. **Всплывающий OSD-индикатор (`F4`)**:
   - Информативная плашка с кодом языка и иконкой по центру экрана при смене раскладки.
   - Настраиваемая длительность показа (от 300 до 3000 мс).
   - Переключатель показа OSD при автоматической смене фокуса между окнами.
   - Полная поддержка стандартов доступности GNOME (`St.ReducedMotion` отключает анимацию исчезновения).

5. **Нативное окно настроек Libadwaita (`F5`)**:
   - Современный интерфейс на базе Libadwaita, полностью соответствующий гайдлайнам GNOME (HIG).
   - Интерактивный захват комбинаций клавиш с проверкой дубликатов и кнопками сброса.

6. **Исправление текста в неверной раскладке (`F6`)**:
   - Конвертация последнего набранного слова в противоположную раскладку по двойному нажатию левого Shift (`<Shift_L>` < 400 мс) или настраиваемой горячей клавише (`<Shift>Pause`).
   - Прямой XKB-маппинг символов без внешних библиотек и бинарников.
   - Кольцевой буфер в оперативной памяти (максимум 64 символа) с автоочисткой через 3 секунды неактивности.
   - **Отключено по умолчанию** ради безопасности: никакого логирования, никакой записи на диск, никакой передачи по сети.

---

### Скриншоты

<!-- SCREENSHOT_RU_PREFS_PLACEHOLDER -->
```
+-----------------------------------------------------------------------+
|  [<] Настройки Liswitch                                     [-] [x]   |
+-----------------------------------------------------------------------+
|  ( ) Индикатор   (*) Клавиши   ( ) Память   ( ) OSD   ( ) Исправление |
|                                                                       |
|  Основные сочетания клавиш                                            |
|  Следующая раскладка                      [ <Control><Shift>   ]  [x] |
|  Предыдущая раскладка                     [ Отключено          ]  [+] |
|                                                                       |
|  Прямой выбор раскладки                                               |
|  Переключить на раскладку 1 (English)     [ <Control><Alt>1    ]  [x] |
|  Переключить на раскладку 2 (Русская)     [ <Control><Alt>2    ]  [x] |
|                                                                       |
|  Системные конфликты                                                  |
|  [!] Super+Space назначен на системное переключение раскладок         |
|  [ Перехватить и управлять через Liswitch                          ]  |
+-----------------------------------------------------------------------+
```
*(Макет скриншота: Окно настроек Libadwaita)*

---

### Установка

#### С сайта extensions.gnome.org (Рекомендуется)
1. Откройте [страницу Liswitch на extensions.gnome.org](https://extensions.gnome.org/extension/liswitch@local/).
2. Переведите переключатель в положение **ON** и подтвердите установку.

#### Из готового zip-архива
Скачайте `liswitch@local.shell-extension.zip` со страницы релизов GitHub:
```bash
gnome-extensions install --force liswitch@local.shell-extension.zip
```

#### Из исходного кода
Склонируйте репозиторий и соберите расширение с помощью `make`:
```bash
git clone https://github.com/liswitch/liswitch.git
cd liswitch
make pack
make install
```

---

### Включение расширения

В GNOME Shell первичное обнаружение каталогов расширений происходит только при старте сессии. После **первой** установки выполните выход из системы (Log Out) и повторный вход, затем включите расширение:

```bash
# Включение через терминал
gnome-extensions enable liswitch@local

# Проверка статуса
gnome-extensions info liswitch@local
```
Либо воспользуйтесь стандартным приложением **Расширения** (`gnome-extensions-app`).

---

### Настройка параметров

Открыть окно настроек можно командой:
```bash
gnome-extensions prefs liswitch@local
```
или через пункт **Параметры...** в выпадающем меню индикатора.

#### Вкладки настроек:
- **Индикатор**: включение индикатора панели, формат надписи (`short`, `uppercase`, `lowercase`, `full`), переключение колесом мыши, скрытие системного индикатора.
- **Горячие клавиши**: комбинации для циклического переключения, шорткаты прямого выбора 1–4, разрешение конфликтов с системными комбинациями GNOME.
- **Память окон**: выбор режима (`per-app`, `per-window`, выключено), восстановление раскладки при смене фокуса, список приложений-исключений.
- **Всплывающий OSD**: включение уведомления, задержка показа в миллисекундах, отображение при автопереключении.
- **Исправление текста**: включение функции трансляции ошибочно набранного текста, двойной Left Shift, назначение горячей клавиши.

---

### Известные ограничения Wayland

1. **Модель безопасности Wayland**: В сессии Wayland приложения изолированы друг от друга и не могут глобально перехватывать нажатия клавиш. Вся обработка шорткатов и управление источниками ввода выполняются на стороне композитора Mutter и GNOME Shell.
2. **Первичное обнаружение расширений**: GNOME Shell сканирует каталог `~/.local/share/gnome-shell/extensions` только при запуске сессии. После ручной установки требуется перезайти в сеанс пользователя (relogin).
3. **Вставка в терминалах**: Для вставки исправленного текста используется эмуляция `Ctrl+V`. В терминалах (`gnome-console`, `ptyxis`), использующих `Ctrl+Shift+V`, автоматическая вставка может не сработать.
4. **Поля ввода паролей**: В целях безопасности поля ввода паролей блокируют инспекцию со стороны UI. Liswitch автоматически подавляет эвристику исправления в диалогах аутентификации.

---

### Конфликты с системными сочетаниями

По умолчанию в GNOME Shell сочетания `Super+Space` и `Shift+Super+Space` привязаны к `switch-input-source` в схеме `org.gnome.desktop.wm.keybindings`.
Если вы назначаете эти сочетания в Liswitch:
1. Liswitch безопасно отключает системный шорткат, предотвращая появление стандартного системного попапа GNOME.
2. При выключении или удалении Liswitch все изменённые системные настройки **гарантированно восстанавливаются** в исходное состояние.

---

### Часто задаваемые вопросы (FAQ)

**В: Почему после ручной установки расширение не отображается в списке?**
> **О:** GNOME Shell сканирует папки расширений только при старте. Завершите сеанс (Log Out) и войдите снова.

**В: Какие версии GNOME Shell поддерживаются?**
> **О:** Liswitch поддерживает **GNOME Shell 47, 48, 49, 50 и 51+** благодаря тонкому слою совместимости (`src/compat.js`) на базе feature detection (`St.ReducedMotion` / `enable_animations`, `St.BoxLayout.orientation` / `vertical`, `Clutter.Seat` через `global.backend` / `stage.context` / `Clutter.get_default_backend`) без хардкода версий. Для GNOME 50+ поддерживается только чистый Wayland (поддержка X11 удалена в самом GNOME Shell).

**В: Безопасна ли функция исправления опечаток?**
> **О:** Полностью безопасна. Функция **выключена по умолчанию**. Буфер хранится строго в оперативной памяти (не более 64 символов), очищается при паузе 3 секунды или смене окна, не пишется на диск и не передаётся по сети.

**В: Как исключить приложение из автоматического запоминания раскладки?**
> **О:** Перейдите в Настройки -> Память окон -> Исключённые приложения и введите идентификатор `.desktop` файла или класс окна (например, `org.gnome.Console`).

---

### Диагностика и отправка отчётов об ошибках

Если вы столкнулись с ошибкой:

1. **Включите режим отладки**:
   ```bash
   gsettings set org.gnome.shell.extensions.liswitch debug true
   ```

2. **Соберите лог GNOME Shell**:
   ```bash
   journalctl -b /usr/bin/gnome-shell -o cat | grep -i liswitch > liswitch-debug.log
   ```

3. **Соберите данные о системе**:
   ```bash
   gnome-shell --version
   echo $XDG_SESSION_TYPE
   gsettings get org.gnome.desktop.input-sources sources
   ```

4. **Создайте Issue на GitHub**:
   Опишите проблему в [GitHub Issues](https://github.com/liswitch/liswitch/issues) и приложите полученный файл `liswitch-debug.log`.

---

### Лицензия

Проект распространяется под свободной лицензией **GNU General Public License версии 2.0 или более поздней** ([GPL-2.0-or-later](LICENSE)).
