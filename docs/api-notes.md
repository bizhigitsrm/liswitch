# Справка по API GNOME Shell 51 для расширения liswitch

> Документ сформирован по результатам прямого аудита исходного кода GNOME Shell 51.1, Mutter 51.1 и GJS 1.90.1 (компоненты среды Fedora 45 / GNOME 51).  
> Все вызовы проверены по ресурсам `resource:///org/gnome/shell/` (`libshell-51.so`), GObject Introspection typelib (`Meta-51`, `Shell-51`, `St-51`, `Clutter-51`) и системным схемам GSettings.

---

## 1. Сводка эволюции API (GNOME 48 → 49 → 50 → 51)

| Версия GNOME | Ключевые изменения архитектуры и API |
|---|---|
| **GNOME 48** | Стандартные ES-модули (ESM), Libadwaita в окне настроек (`prefs.js`), Clutter/Meta 48. |
| **GNOME 49** | Подготовка к полному отказу от X11, ужесточение проверок жизненного цикла расширений. |
| **GNOME 50** | 1. **Полное удаление сессии X11**: GNOME Shell работает исключительно как Wayland-композитор (`--wayland` или `--headless`). В Mutter удалена поддержка классического оконного менеджера X11 (Xwayland остаётся лишь клиентом трансляции).<br>2. Из `misc/keyboardManager.js` удалены устаревшие методы `releaseKeyboard()` и `holdKeyboard()`.<br>3. Удалён `ui/pointerWatcher.js`; отслеживание курсора перенесено в `global.backend.get_cursor_tracker()`.<br>4. Внедрён стандарт проверки доступности движения `St.ReducedMotion` (`REDUCE`, `NO_PREFERENCE`). |
| **GNOME 51** | 1. **GJS 1.90.1 (SpiderMonkey / MozJS 140)**: поддержка современных возможностей ECMAScript.<br>2. **Строгий запрет `async disable()`**: в `ui/extensionSystem.js` внедрена проверка `if (res?.then !== undefined) throw new Error('disable() must not be async')`. Метод `disable()` обязан быть строго синхронным.<br>3. **`InjectionManager` в `extensions/extension.js`**: официальный класс для безопасного переопределения методов (`overrideMethod`, `restoreMethod`, `clear`).<br>4. **`gnome-shell-test-tool`** получил флаг `--extension <zip>` для автоматизированного тестирования расширений.<br>5. Запуск для разработки: флаг `--devkit` вместо устаревшего `--nested` (при запуске `gnome-shell --wayland` без `--display-server` вложенная сессия запускается по умолчанию).<br>6. Все связанные typelib имеют суффикс `51` (`gi.require_version('Meta', '51')`, `Shell`, `St`, `Clutter`). |

---

## 2. Таблица проверенных API GNOME Shell 51

| API / Символ | Модуль / Файл | Сигнатура / Тип | Источник (файл, строка) | Статус |
|---|---|---|---|---|
| `getInputSourceManager()` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `(): InputSourceManager` | `ui/status/keyboard.js:891` | Подтверждено |
| `InputSourceManager` | `resource:///org/gnome/shell/ui/status/keyboard.js` | Класс (`Signals.EventEmitter`) | `ui/status/keyboard.js:463` | Подтверждено |
| `InputSourceManager.currentSource` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `get currentSource(): InputSource \| null` | `ui/status/keyboard.js:879` | Подтверждено |
| `InputSourceManager.inputSources` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `get inputSources(): { [index: number]: InputSource }` | `ui/status/keyboard.js:883` | Подтверждено |
| `InputSourceManager.keyboardManager` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `get keyboardManager(): KeyboardManager` | `ui/status/keyboard.js:887` | Подтверждено |
| `InputSourceManager.reload()` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `(): void` | `ui/status/keyboard.js:527` | Подтверждено |
| `InputSourceManager.activateInputSource()` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `(is: InputSource, interactive: boolean): void` | `ui/status/keyboard.js:774` | Подтверждено |
| Сигнал `current-source-changed` | `InputSourceManager` | `(manager: InputSourceManager, oldSource: InputSource \| null)` | `ui/status/keyboard.js:755, 770` | Подтверждено |
| Сигнал `sources-changed` | `InputSourceManager` | `(manager: InputSourceManager)` | `ui/status/keyboard.js:633, 679` | Подтверждено |
| Сигнал `keymap-changed` | `InputSourceManager` | `(manager: InputSourceManager)` | `ui/status/keyboard.js:662` | Подтверждено |
| `InputSource` | `resource:///org/gnome/shell/ui/status/keyboard.js` | Класс (`Signals.EventEmitter`)<br>`constructor(type, id, displayName, shortName, index)` | `ui/status/keyboard.js:13` | Подтверждено |
| `InputSource.type` | `InputSource` | `'xkb' \| 'ibus'` | `ui/status/keyboard.js:17` | Подтверждено |
| `InputSource.id` | `InputSource` | `string` (например, `'us'`, `'ru'`) | `ui/status/keyboard.js:18` | Подтверждено |
| `InputSource.displayName` | `InputSource` | `string` (например, `'English (US)'`) | `ui/status/keyboard.js:19` | Подтверждено |
| `InputSource.shortName` | `InputSource` | `string` (геттер/сеттер; сеттер генерирует `changed`) | `ui/status/keyboard.js:28-35` | Подтверждено |
| `InputSource.index` | `InputSource` | `number` (индекс в списке источников) | `ui/status/keyboard.js:21` | Подтверждено |
| `InputSource.xkbId` | `InputSource` | `string` (`layout` или `layout+variant`) | `ui/status/keyboard.js:25, 41` | Подтверждено |
| `InputSource.activate()` | `InputSource` | `(interactive: boolean): void` (генерирует `'activate'`) | `ui/status/keyboard.js:37` | Подтверждено |
| `InputSourcePopup` | `resource:///org/gnome/shell/ui/status/keyboard.js` | `class InputSourcePopup extends SwitcherPopup.SwitcherPopup`<br>`constructor(items, action, actionBackward)` | `ui/status/keyboard.js:49` | Подтверждено |
| `InputSourcePopup.show()` | `InputSourcePopup` | `(backward: boolean, bindingName: string, mask: number): boolean` | `ui/switcherPopup.js:163` | Подтверждено |
| `Main.wm.addKeybinding()` | `resource:///org/gnome/shell/ui/windowManager.js` | `(name: string, settings: Gio.Settings, flags: Meta.KeyBindingFlags, modes: Shell.ActionMode, handler: Function): number` | `ui/windowManager.js:2104` | Подтверждено |
| `Main.wm.removeKeybinding()` | `resource:///org/gnome/shell/ui/windowManager.js` | `(name: string): void` | `ui/windowManager.js:2111` | Подтверждено |
| `Main.wm.allowKeybinding()` | `resource:///org/gnome/shell/ui/windowManager.js` | `(name: string, modes: Shell.ActionMode): void` | `ui/windowManager.js:2116` | Подтверждено |
| `Meta.KeyBindingFlags` | `gi://Meta?version=51` | Флаги (`NONE=0`, `PER_WINDOW=1`, `BUILTIN=2`, `IS_REVERSED=4`, `NON_MASKABLE=8`, `IGNORE_AUTOREPEAT=16`, `NO_AUTO_GRAB=32`, `CUSTOM_TRIGGER=64`, `TRIGGER_RELEASE=128`) | `libmutter-51/Meta-51.typelib` | Подтверждено |
| `Shell.ActionMode` | `gi://Shell?version=51` | Флаги (`NONE=0`, `NORMAL=1`, `OVERVIEW=2`, `LOCK_SCREEN=4`, `UNLOCK_SCREEN=8`, `LOGIN_SCREEN=16`, `SYSTEM_MODAL=32`, `LOOKING_GLASS=64`, `POPUP=128`, `ALL=4294967295`) | `gnome-shell/Shell-51.typelib` | Подтверждено |
| `global.display` | `Shell.Global` | Глобальный экземпляр `Meta.Display` | `ui/main.js` | Подтверждено |
| `global.display.focus_window` | `Meta.Display` | `get focus_window(): Meta.Window \| null` | `libmutter-51/Meta-51.typelib` | Подтверждено |
| Сигнал `notify::focus-window` | `Meta.Display` | `connect(signal: 'notify::focus-window', callback: () => void): number` | `ui/status/keyboard.js:847` | Подтверждено |
| Сигнал `modifiers-accelerator-activated` | `Meta.Display` | `connect(signal: 'modifiers-accelerator-activated', callback: () => void): number` | `ui/status/keyboard.js:520` | Подтверждено |
| Сигнал `window-created` | `Meta.Display` | `connect(signal: 'window-created', callback: (display, window: Meta.Window) => void): number` | `ui/windowAttentionHandler.js:33` | Подтверждено |
| `Meta.Window.get_id()` | `Meta.Window` | `(): number` (уникальный 64-битный ID окна) | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_wm_class()` | `Meta.Window` | `(): string` (класс окна X11/Wayland app_id) | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_wm_class_instance()` | `Meta.Window` | `(): string` | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_sandboxed_app_id()` | `Meta.Window` | `(): string \| null` (Flatpak/Snap ID) | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_gtk_application_id()` | `Meta.Window` | `(): string \| null` | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_title()` | `Meta.Window` | `(): string` | `Meta-51.typelib` | Подтверждено |
| `Meta.Window.get_pid()` | `Meta.Window` | `(): number` | `Meta-51.typelib` | Подтверждено |
| Сигнал `unmanaged` | `Meta.Window` | `connect(signal: 'unmanaged', callback: (window: Meta.Window) => void): number` | `ui/windowManager.js:1490` | Подтверждено |
| `PanelMenu.Button` | `resource:///org/gnome/shell/ui/panelMenu.js` | Класс кнопки панели (`constructor(menuAlignment?: number, nameText?: string, dontCreateMenu?: boolean)`) | `ui/panelMenu.js:21` | Подтверждено |
| `PanelMenu.Button.menu` | `PanelMenu.Button` | Экземпляр `PopupMenu.PopupMenu` | `ui/panelMenu.js:39` | Подтверждено |
| `Main.panel.addToStatusArea()` | `resource:///org/gnome/shell/ui/panel.js` | `(role: string, indicator: PanelMenu.Button, position?: number, box?: 'left' \| 'center' \| 'right'): PanelMenu.Button` | `ui/panel.js:731` | Подтверждено |
| `Main.panel.statusArea` | `resource:///org/gnome/shell/ui/panel.js` | Словарь индикаторов `{ [role: string]: PanelMenu.Button }` | `ui/panel.js:720, 731` | Подтверждено |
| `St.Label` | `gi://St?version=51` | Виджет текстовой метки (`text: string`, `style_class: string`) | `St-51.typelib` | Подтверждено |
| `PopupMenu.PopupMenuItem` | `resource:///org/gnome/shell/ui/popupMenu.js` | `constructor(text: string, params?: object)` | `ui/popupMenu.js:154` | Подтверждено |
| `PopupMenu.PopupSeparatorMenuItem` | `resource:///org/gnome/shell/ui/popupMenu.js` | `constructor(text?: string)` | `ui/popupMenu.js:636` | Подтверждено |
| `PopupMenu.Ornament` | `resource:///org/gnome/shell/ui/popupMenu.js` | Перечисление (`NONE=0`, `DOT=1`, `CHECK=2`, `HIDDEN=3`, `NO_DOT=4`) | `ui/popupMenu.js:16` | Подтверждено |
| `Main.osdWindowManager` | `resource:///org/gnome/shell/ui/osdWindow.js` | `OsdWindowManager` (`showAll`, `showOne`, `hideAll`) | `ui/osdWindow.js:189` | Подтверждено |
| `global.backend.get_cursor_tracker()` | `Meta.Backend` | `(): Meta.CursorTracker` (координаты, видимость, хотспот курсора) | `ui/magnifier.js:1005` | Подтверждено |
| `St.Settings.get().reduced_motion` | `gi://St?version=51` | `St.ReducedMotion` (`NO_PREFERENCE=0`, `REDUCE=1`) | `St-51.typelib`, `ui/boxpointer.js:77` | Подтверждено |
| `Extension` | `resource:///org/gnome/shell/extensions/extension.js` | Базовый класс (`enable()`, синхронный `disable()`, `getSettings()`) | `extensions/extension.js:8` | Подтверждено |
| `ExtensionPreferences` | `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` | Базовый класс настроек (`fillPreferencesWindow(window)`) | `prefs.js` | Подтверждено |
| `InjectionManager` | `resource:///org/gnome/shell/extensions/extension.js` | `class InjectionManager` (`overrideMethod`, `restoreMethod`, `clear`) | `extensions/extension.js:34` | Подтверждено |
| `Gio.DBusProxy.makeProxyWrapper()` | `gi://Gio` (GJS override) | `(interfaceXml: string): typeof Gio.DBusProxy` (создание через `new`) | `ui/dateMenu.js:14`, `ui/mpris.js:24` | Подтверждено |
| `KeyboardManager` | `resource:///org/gnome/shell/misc/keyboardManager.js` | `getKeyboardManager(): KeyboardManager`<br>`apply(xkbId)`, `setUserLayouts()`, `setKeyboardOptions()`, `isLocked()` | `misc/keyboardManager.js` | Подтверждено |
| `GObject.Object.connectObject` | GJS override | Автопривязка сигналов к жизненному циклу объекта | `ui/status/keyboard.js:958` | Подтверждено |
| Перехват нажатия клавиш на уровне Clutter Stage | `global.stage.connect('captured-event', ...)` | `(stage, event: Clutter.Event): Clutter.EventFilter` | `ui/main.js` | VERIFY: влияние на производительность ввода при глобальном фильтре |

---

## 3. Архитектура управления раскладками в GNOME Shell 51

### 3.1. `ui/status/keyboard.js`
1. **Синглтон `getInputSourceManager()`**:
   Возвращает глобальный экземпляр `InputSourceManager`.
2. **Класс `InputSourceManager`**:
   - `this._inputSources`: объект `{ [index: number]: InputSource }`, сформированный из GSettings `org.gnome.desktop.input-sources sources`.
   - `this._currentSource`: активный `InputSource`.
   - `this._mruSources`: массив `InputSource[]`, упорядоченный по истории использования (Most Recently Used).
   - `activateInputSource(is, interactive)`:
     - Применяет раскладку через `this._keyboardManager.apply(is.xkbId)`.
     - Задаёт движок IBus (`this._ibusManager.setEngine(engine)`).
     - Вызывает `_currentInputSourceChanged(is, interactive)`, который излучает сигнал `current-source-changed`.
     - Если `interactive === true`, обновляет ключ `mru-sources` в GSettings (`_updateMruSettings()`).
3. **Класс `InputSource`**:
   - Поля: `type` (`'xkb'` или `'ibus'`), `id` (`'us'`, `'ru'`), `displayName`, `shortName`, `index`, `xkbId`.
   - Метод `activate(interactive)`: посылает сигнал `'activate'`, который слушает `InputSourceManager` и передаёт в `activateInputSource(this, interactive)`.
4. **Переключение по `switch-input-source` (Super+Space)**:
   - Обработчик `_switchInputSource()` проверяет блокировку (`this._keyboardManager.isLocked()`).
   - Если активен режим всплывающего окна (`Main.actionMode === Shell.ActionMode.POPUP`), переключает без попапа вызовом `_modifiersSwitcher()`.
   - Иначе создаёт `new InputSourcePopup(this._mruSources, ...)`, который отображает окно со списком раскладок в порядке MRU и захватывает фокус клавиш. При отпускании клавиши-модификатора вызывается `_finish()`, активирующий выбранную раскладку.
5. **Режим `per-window`**:
   - Настройка `org.gnome.desktop.input-sources per-window` (булево).
   - При включении подключается слушатель `global.display.connect('notify::focus-window', this._setPerWindowInputSource.bind(this))` и события `Main.overview` (`showing`, `hidden`).
   - К каждому объекту `Meta.Window` (или `Main.overview`) динамически прикрепляются свойства `window._inputSources` и `window._currentSource`.
   - При смене фокуса вызывается `window._currentSource.activate(false)` (не интерактивно, чтобы не ломать глобальный порядок MRU).
   - При отключении `per-window` свойства `_inputSources` и `_currentSource` удаляются из всех акторов окон.

### 3.2. Схемы GSettings

#### Схема `org.gnome.desktop.input-sources`
- **`sources`** (`a(ss)`): список пар `(тип, идентификатор)`. Пример: `[('xkb', 'us'), ('xkb', 'ru')]`. Для XKB формат: `layout` или `layout+variant`.
- **`current`** (`u`): *УСТАРЕЛ И ИГНОРИРУЕТСЯ* (DEPRECATED в GNOME Shell). Попытка записи в него не переключает раскладку в сессии.
- **`mru-sources`** (`a(ss)`): упорядоченный список последних использованных раскладок. Активная раскладка находится в `mru-sources[0]`.
- **`xkb-options`** (`as`): параметры XKB, передаваемые в Mutter (например, `['grp:alt_shift_toggle']`).
- **`per-window`** (`b`): флаг запоминания раскладки для каждого окна.

#### Схема `org.gnome.desktop.wm.keybindings`
- **`switch-input-source`** (`as`): по умолчанию `['<Super>space', 'XF86Keyboard']`.
- **`switch-input-source-backward`** (`as`): по умолчанию `['<Shift><Super>space', '<Shift>XF86Keyboard']`.

---

## 4. Регистрация сочетаний клавиш расширением

Для назначения собственных горячих клавиш используется интерфейс `Main.wm`:
```javascript
// 1. Регистрация в enable()
this._actionId = Main.wm.addKeybinding(
    'my-shortcut-key',          // имя ключа в собственной схеме GSettings
    this.getSettings(),          // экземпляр Gio.Settings расширения
    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
    (display, window, event, binding) => {
        this._onShortcutTriggered();
    }
);

// 2. Очистка в disable()
Main.wm.removeKeybinding('my-shortcut-key');
```

### Требования к схеме GSettings
Ключ в собственной схеме `org.gnome.shell.extensions.liswitch.gschema.xml` обязан иметь тип `as`:
```xml
<key name="my-shortcut-key" type="as">
    <default><![CDATA[['<Super>grave']]]></default>
    <summary>Custom switch shortcut</summary>
</key>
```

---

## 5. Отслеживание фокуса и окон в Wayland

1. **Смена фокуса**:
   Сигнал `notify::focus-window` на объекте `global.display`.
   Активное окно доступно как `global.display.focus_window` (тип `Meta.Window` или `null`).
2. **Идентификация окна**:
   - `window.get_id()`: уникальный числовой идентификатор окна в Mutter (uint64). Подходит для ключа в `Map`/кэше.
   - `window.get_wm_class()`: строковый идентификатор приложения (`app_id` в Wayland, `WM_CLASS` в Xwayland).
   - `window.get_sandboxed_app_id()`: идентификатор песочницы Flatpak/Snap (или `null`).
   - `window.get_gtk_application_id()`: GTK Application ID (или `null`).
   - `window.get_title()`: заголовок окна.
3. **Уничтожение окна (`unmanaged`)**:
   Обязательно слушать сигнал `'unmanaged'` на каждом отслеживаемом окне:
   ```javascript
   const unmanagedId = window.connect('unmanaged', w => {
       this._windowMap.delete(w.get_id());
       w.disconnect(unmanagedId);
   });
   ```
   Или использовать `window.connectObject('unmanaged', () => { ... }, this)`.

---

## 6. Индикатор в панели (PanelMenu)

1. **Создание кнопки**:
   Подкласс `PanelMenu.Button`. В конструкторе вызывается `super._init(alignment, nameText)`.
2. **Добавление в панель**:
   `Main.panel.addToStatusArea(role, indicator, position, box)`.
   - `role`: строка, уникальная в `Main.panel.statusArea`. Роль `'keyboard'` уже занята стандартным индикатором! Для расширения следует использовать `'liswitch'` (или UUID).
   - `box`: `'left'`, `'center'`, или `'right'` (по умолчанию `'right'`).
3. **Очистка**:
   Вызов `indicator.destroy()` в `disable()` автоматически удаляет элемент из контейнера панели и стирает ключ из `Main.panel.statusArea`.
4. **Виджеты метки и меню**:
   - Метка: `new St.Label({ text: 'EN', y_align: Clutter.ActorAlign.CENTER })`.
   - Пункты меню: `new PopupMenu.PopupMenuItem(_('Layout Name'))`.
   - Отметки выбора: `item.setOrnament(PopupMenu.Ornament.DOT)` / `PopupMenu.Ornament.NONE`.
   - Разделители: `new PopupMenu.PopupSeparatorMenuItem()`.

---

## 7. Тестовое окружение GNOME 51

### 7.1. Ограничения вложенной сессии (Nested Wayland) и запуск на TTY
В GNOME 50/51 при удалении X11 бэкенда в Mutter был также удалён вложенный X11-клиент. В Mutter 51 скомпилирован исключительно нативный бэкенд (`MetaBackendNative`), работающий либо в режиме DRM/KMS, либо в режиме headless.
Поэтому попытка запустить второй экземпляр GNOME Shell (`dbus-run-session gnome-shell --wayland --no-x11`) внутри существующей графической сессии завершается ошибкой:
`Failed to take control of the session: GDBus.Error:System.Error.EBUSY: Device or resource busy`
так как Mutter пытается захватить DRM master через `systemd-logind`.
- **Способы тестирования**:
  1. **Изолированный headless-тест**: использовать `gnome-shell-test-tool --headless --extension <zip> tests/smoke-test.js`.
  2. **Интерактивная сессия**: переключиться на отдельный виртуальный терминал (например, `Ctrl+Alt+F3`), залогиниться и запустить `dbus-run-session gnome-shell --wayland --no-x11`.
  3. **Тестирование в виртуальной машине** (GNOME Boxes / QEMU).


### 7.2. Автоматизированное тестирование через `gnome-shell-test-tool`
В GNOME 51 утилита `gnome-shell-test-tool` поддерживает опцию `--extension`:
```bash
# 1. Упаковка расширения
gnome-extensions pack --force

# 2. Запуск изолированного headless-теста с установкой и включением расширения
gnome-shell-test-tool --headless --extension liswitch@local.zip tests/smoke-test.js
```

### 7.3. Управление расширением через CLI
```bash
# Сборка пакета
gnome-extensions pack --force

# Установка
gnome-extensions install --force liswitch@local.zip

# Включение / отключение
gnome-extensions enable liswitch@local
gnome-extensions disable liswitch@local

# Просмотр информации
gnome-extensions info liswitch@local
```

### 7.4. Просмотр логов и Looking Glass
- Журнал в реальном времени:
  ```bash
  journalctl -f -o cat /usr/bin/gnome-shell
  ```
- Looking Glass:
  Нажать `Alt+F2`, ввести `lg` и нажать Enter. Вкладки: Evaluator (выполнение JS прямо в контексте Shell), Windows, Extensions.

---

## 8. Подводные камни (Pitfalls)

1. **Запрет `async disable()` в GNOME 51**:
   Если метод `disable()` возвращает `Promise` (объявлен как `async` или возвращает `thenable`), `_callExtensionDisable` в `ui/extensionSystem.js` выбрасывает исключение `Error: disable() must not be async`. Расширение переходит в ошибочное состояние, а ресурсы утекают.
2. **Конфликт роли в `Main.panel.addToStatusArea`**:
   Стандартный индикатор клавиатуры зарегистрирован под ролью `'keyboard'`. Попытка вызвать `addToStatusArea('keyboard', ...)` приведёт к ошибке `Extension point conflict: there is already a status indicator for role keyboard`. Необходимо регистрировать собственную роль `'liswitch'` и при необходимости скрывать стандартный индикатор через `Main.panel.statusArea['keyboard']?.hide()`.
3. **Бесполезность записи в `org.gnome.desktop.input-sources current`**:
   Этот ключ GSettings помечен как DEPRECATED и полностью игнорируется GNOME Shell. Попытка переключить раскладку через `settings.set_uint('current', index)` не даёт никакого эффекта. Единственный корректный путь — вызов метода `InputSource.activate()` или `InputSourceManager.activateInputSource()`.
4. **Разрушение порядка MRU при неинтерактивном переключении**:
   При программной смене раскладки (например, при восстановлении раскладки для окна) необходимо передавать `interactive = false` в `activate(false)`. Иначе каждая смена фокуса окна будет перетасовывать глобальный список MRU, ломая поведение Super+Space для пользователя.
5. **Конфликт `xkb-options` и горячих клавиш Mutter**:
   Если пользователь назначил переключение раскладок в `org.gnome.desktop.input-sources xkb-options` (например, `grp:alt_shift_toggle` или `grp:caps_toggle`), событие перехватывается Mutter на уровне драйвера клавиатуры и передаётся через сигнал `modifiers-accelerator-activated` напрямую в `_modifiersSwitcher()`. Перехватить или отменить это через стандартный `Main.wm.addKeybinding` невозможно без вмешательства в настройки или фильтрации событий на Clutter Stage.
6. **Утечки памяти при отслеживании окон**:
   Объекты `Meta.Window` не уничтожаются сборщиком мусора сразу при закрытии окна, если на них остались активные обработчики сигналов или ссылки в коллекциях расширения. Обязательно отслеживать сигнал `'unmanaged'` и очищать ссылки.
7. **`Gio.DBusProxy.makeProxyWrapper` возвращает класс, а не объект**:
   В GJS функция `makeProxyWrapper` возвращает фабрику-конструктор. Инстанцирование должно производиться строго через оператор `new`: `const proxy = new MyProxy(Gio.DBus.session, ...)`. Вызов без `new` вызывает `TypeError`.
8. **Требование доступности движения (`St.ReducedMotion`)**:
   В GNOME 50/51 при `St.Settings.get().reduced_motion === St.ReducedMotion.REDUCE` все визуальные переходы и анимации должны быть отключены. Игнорирование этого флага нарушает гайдлайны доступности GNOME и приводит к отклонению расширения на extensions.gnome.org.
9. **`global.display.focus_window` может быть `null`**:
   В момент открытия Overview, нажатия на рабочий стол или отображения системных модальных окон фокус окна сбрасывается в `null`. Код обязан проверять наличие окна перед обращением к его свойствам.
10. **Ограничения `Shell.ActionMode` при модальных окнах**:
    Если сочетание клавиш зарегистрировано с `Shell.ActionMode.NORMAL`, оно не сработает в Overview, в режиме блокировки экрана или при открытом меню. Для переключателя раскладки требуется явно указывать комбинацию режимов (например, `Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP`).
11. **Первичное обнаружение расширений в `~/.local/share/gnome-shell/extensions` на Wayland**:
    GNOME Shell сканирует каталоги расширений (`collectFromDatadirs`) только один раз — при старте сессии. Утилита `gnome-extensions install` просто распаковывает zip в целевой каталог, но не уведомляет запущенный Shell (метод `ReloadExtension` в DBus депрекейтнут и возвращает `NOT_SUPPORTED`). В результате свежеустановленное локальное расширение возвращает `Extension doesn't exist` до тех пор, пока пользователь не перезайдёт в сессию (relogin), либо пока расширение не будет загружено в рантайм через Looking Glass (`Main.extensionManager.loadExtension(...)`).
12. **Конфликт DRM при попытке запуска вложенного Shell в GNOME 51**:
    В Mutter 51 отсутствует вложенный Wayland-клиент. Команда `gnome-shell --wayland` запускает `MetaBackendNative` в режиме DRM/KMS и пытается вызвать `TakeControl()` у `systemd-logind`. Если сессия уже запущена, logind возвращает ошибку `EBUSY: Device or resource busy`. Для тестирования следует использовать headless-раннер `gnome-shell-test-tool` либо отдельный TTY (VT3).


---

## 9. Что точно не получится на Wayland

1. **Глобальный перехват и симуляция ввода вне Shell**:
   В Wayland клиенты изолированы друг от друга. Приложения не могут слушать глобальный ввод и не могут внедрять фальшивые нажатия клавиш в другие окна (нет `XRecord`, `XTest`, `XSendEvent`). Расширение GNOME Shell выполняется внутри самого композитора Mutter, поэтому имеет доступ к внутренним событиям Shell, но не имеет прямого доступа к внутреннему состоянию сторонних Wayland-клиентов.
2. **Ретроспективное преобразование введённого текста (а-ля Punto Switcher на лету)**:
   Поскольку композитор передаёт нажатия клавиш напрямую в сокет клиента через протокол Wayland, Shell не хранит текстовый буфер внутри чужого окна и не может «стереть N символов и вставить их в другой раскладке», не эмулируя серию Backspace через виртуальное устройство ввода. Делать это без IBus крайне ненадежно и опасно.
3. **Чтение свойств окон X11 (Atoms) у нативных Wayland-окон**:
   У Wayland-окон отсутствуют свойства X11 (`_NET_ACTIVE_WINDOW`, `WM_NAME` и др.). Вся информация об окне доступна исключительно через интерфейс `Meta.Window` (`wm_class` / `app_id`, заголовок, sandboxed app ID).
4. **Использование внешних утилит конфигурации X11 (`setxkbmap`, `xdotool`, `xmodmap`)**:
   Запуск внешних утилит X11 в сессии Wayland бессмысленен, так как они либо завершатся с ошибкой отсутствия `$DISPLAY`, либо повлияют только на сессию Xwayland, не затрагивая Mutter и нативные Wayland-приложения.
5. **Обход модальных захватов Mutter**:
   Если активен системный захват ввода (например, ввод пароля экрана блокировки или системного диалога), ни одно расширение не может выборочно перехватывать глобальные комбинации в обход ограничений `Shell.ActionMode`.

---

## 10. Открытые вопросы для последующих этапов

1. **Стратегия индикатора**: заменять стандартный индикатор раскладки в панели (скрывать `'keyboard'` и показывать `'liswitch'`) или дополнять его?
2. **Уровень детализации памяти раскладки**: запоминать раскладку строго по окну (`window.get_id()`), по классу приложения (`window.get_wm_class()`) или гибридно (по умолчанию класс, для избранных — окно)?
3. **Поведение всплывающего уведомления**: требуется ли отображать всплывающий OSD-индикатор при переключении через `Main.osdWindowManager.showOne(...)` или достаточно индикатора в панели?
4. **Сосуществование с системным переключателем**: отключать ли системные горячие клавиши в `org.gnome.desktop.wm.keybindings` на время работы расширения (с обязательным восстановлением в `disable()`) или использовать альтернативную свободную комбинацию?
