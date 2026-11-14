# Журнал разработки расширения liswitch (liswitch@local)

Проект: расширение для GNOME Shell 51 (GJS 1.90, только Wayland), улучшающее переключение раскладок клавиатуры.
Файл `docs/PROGRESS.md` является единственной долгосрочной памятью проекта между этапами разработки.

---

## Этап 1. Исследование и справка по API

- **Дата выполнения**: 2026-11-14
- **Статус**: Выполнен

### Что сделано
1. Исследован рантайм GNOME Shell 51.1, Mutter 51.1 и GJS 1.90.1 (Fedora 45 Workstation).
2. Выгружены и детально изучены 200 исходных файлов JS подсистемы GNOME Shell 51 из встроенного ресурса `libshell-51.so`.
3. Разобрана архитектура управления раскладками в `resource:///org/gnome/shell/ui/status/keyboard.js`:
   - Механизм `getInputSourceManager()`, устройство `InputSourceManager` и `InputSource`.
   - Сигналы `current-source-changed`, `sources-changed`, `keymap-changed`.
   - Различие между интерактивной сменой раскладки (`activate(true)` с обновлением MRU) и тихой сменой (`activate(false)` для восстановления состояния окон).
4. Проанализированы системные схемы GSettings:
   - `org.gnome.desktop.input-sources`: ключи `sources`, `current` (подтверждено, что устарел и игнорируется), `mru-sources`, `xkb-options`, `per-window`.
   - `org.gnome.desktop.wm.keybindings`: ключи `switch-input-source` и `switch-input-source-backward`.
5. Изучены механизмы регистрации горячих клавиш: `Main.wm.addKeybinding`, `Main.wm.removeKeybinding`, флаги `Meta.KeyBindingFlags` и режимы `Shell.ActionMode`.
6. Изучено отслеживание фокуса и окон в Wayland: сигнал `notify::focus-window` на `global.display`, свойства и методы `Meta.Window` (`get_id()`, `get_wm_class()`, `get_sandboxed_app_id()`), сигнал очистки окна `unmanaged`.
7. Изучено создание индикатора панели на базе `PanelMenu.Button`, `Main.panel.addToStatusArea`, виджетов `St.Label` и структуры `PopupMenu`.
8. Изучено тестовое окружение GNOME 51: запуск сессии без `--display-server` (вложенный режим по умолчанию), опция `--devkit`, запуск тестов расширения через `gnome-shell-test-tool --extension`, команды утилиты `gnome-extensions`.
9. Сформирован детальный справочник в файле `docs/api-notes.md`.

### Принятые решения и обоснования
1. **Строго синхронный `disable()`**: подтверждено по исходникам `ui/extensionSystem.js`, что возврат `Promise` в GNOME 51 вызывает исключение `disable() must not be async`. Все операции отключения должны выполняться синхронно.
2. **Уникальная роль индикатора в панели**: в `Main.panel.addToStatusArea` запрещено повторно использовать роль `'keyboard'` (вызывает конфликт расширений). Расширение будет регистрировать роль `'liswitch'` и, при необходимости замены, скрывать системный индикатор через `Main.panel.statusArea['keyboard']?.hide()`.
3. **Игнорирование ключа GSettings `current`**: переключение раскладок будет производиться строго через `InputSource.activate()` или `InputSourceManager.activateInputSource()`, так как запись в `current` задепрекейчена и не обрабатывается Shell.
4. **Обязательное подключение к сигналу `unmanaged`**: для предотвращения утечек памяти при отслеживании окон в Wayland все внутренние кэши окон должны очищаться по сигналу `unmanaged`.
5. **Учёт доступности движения (`St.ReducedMotion`)**: любые анимации индикаторов и переходов обязаны проверять `St.Settings.get().reduced_motion !== St.ReducedMotion.REDUCE`.

### Оставшиеся VERIFY и риски
1. `// VERIFY:` Влияние глобального фильтра событий Clutter Stage (`global.stage.connect('captured-event', ...)`) на задержку ввода — если на последующих этапах понадобится перехват клавиш до того, как они попадут в Wayland-клиент.
2. Риск конфликта с пользовательскими комбинациями в `org.gnome.desktop.input-sources xkb-options` (например, Alt+Shift, перехватываемый на уровне libxkbcommon через `modifiers-accelerator-activated`).

### Созданные и изменённые файлы
- `docs/api-notes.md` — справочник по API GNOME Shell 51, подводные камни, ограничения Wayland, открытые вопросы.
- `docs/PROGRESS.md` — журнал проекта и фиксация результатов Этапа 1.
