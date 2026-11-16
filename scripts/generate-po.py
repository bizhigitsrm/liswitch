#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later

import json

ru_dict = {
    'Disabled': 'Отключено',
    'General': 'Основное',
    'Panel Indicator': 'Индикатор в панели',
    'Configure the layout indicator in the top panel': 'Настройка индикатора раскладки в верхней панели',
    'Show Indicator': 'Показывать индикатор',
    'Display the keyboard layout indicator in the top panel': 'Отображать индикатор раскладки клавиатуры в верхней панели',
    'Hide System Indicator': 'Скрыть системный индикатор',
    'Hide standard GNOME keyboard indicator to prevent duplicates': 'Скрыть стандартный индикатор GNOME для предотвращения дублирования',
    'Scroll to Switch Layout': 'Переключение колесиком мыши',
    'Switch layouts by scrolling the mouse wheel over the indicator': 'Переключать раскладки прокруткой колесика мыши над индикатором',
    'Short (uppercase, e.g. EN)': 'Короткий (заглавные, напр. EN)',
    'Full Name (e.g. English)': 'Полное имя (напр. English)',
    'Lowercase (e.g. en)': 'Строчные буквы (напр. en)',
    'Label Format': 'Формат метки',
    'Choose how layout names appear in the panel': 'Выберите формат отображения названия раскладки в панели',
    'Next to System Indicator': 'Рядом с системным индикатором',
    'Right Panel Box': 'Правая часть панели',
    'Center Panel Box': 'Центр панели',
    'Left Panel Box': 'Левая часть панели',
    'Indicator Position': 'Позиция индикатора',
    'Choose where the layout indicator appears in the top panel': 'Выберите расположение индикатора раскладки в верхней панели',
    'On-Screen Display (OSD)': 'Экранное уведомление (OSD)',
    'Visual notification popup when switching layouts': 'Всплывающее экранное уведомление при смене раскладки',
    'Show OSD Pop-up': 'Показывать всплывающее OSD',
    'Display a brief centered notification when layout changes': 'Показывать краткое уведомление по центру экрана при смене раскладки',
    'Display a brief notification when layout changes': 'Показывать краткое уведомление при смене раскладки',
    'Center of Screen': 'По центру экрана',
    'Top of Screen': 'Вверху экрана',
    'Bottom of Screen': 'Внизу экрана',
    'OSD Position': 'Позиция OSD',
    'Vertical placement of the OSD notification on the active monitor': 'Вертикальное расположение всплывающего уведомления на активном мониторе',
    'OSD Duration': 'Длительность OSD',
    'How long the OSD stays visible (in milliseconds)': 'Время отображения всплывающего уведомления (в миллисекундах)',
    'Show OSD on Window Restore': 'Показывать OSD при восстановлении окна',
    'Display notification when layout is restored automatically by window memory': 'Отображать уведомление, когда раскладка восстанавливается автоматически памятью окон',
    'Diagnostics': 'Диагностика',
    'Options for troubleshooting liswitch': 'Параметры для отладки и диагностики liswitch',
    'Debug Logging': 'Отладочные сообщения',
    'Output detailed diagnostic messages to the system journal': 'Выводить подробные диагностические сообщения в системный журнал',
    'Shortcuts': 'Горячие клавиши',
    'Layout Switching Shortcuts': 'Сочетания для переключения раскладок',
    'Configure keybindings to switch between configured input sources': 'Настройка горячих клавиш для переключения между настроенными источниками ввода',
    'Next Layout': 'Следующая раскладка',
    'Cycle forward through available input sources': 'Циклическое переключение вперед по доступным раскладкам',
    'Previous Layout': 'Предыдущая раскладка',
    'Cycle backward through available input sources': 'Циклическое переключение назад по доступным раскладкам',
    'Direct Layout Selection': 'Прямой выбор раскладки',
    'Jump directly to a specific layout by number (1 to 4)': 'Мгновенный переход к конкретной раскладке по номеру (от 1 до 4)',
    'Switch to Layout %d': 'Переключить на раскладку %d',
    'Directly activate layout at index %d': 'Прямая активация раскладки с индексом %d',
    'Modifier-Only Switching (System XKB)': 'Переключение модификаторами (системный XKB)',
    'GNOME Shell keybindings require a non-modifier key. Pure modifier combinations are configured at the system XKB level via org.gnome.desktop.input-sources xkb-options (other XKB options such as compose:* or lv3:* are preserved).': 'Для горячих клавиш GNOME Shell требуется клавиша, не являющаяся модификатором. Сочетания только из модификаторов настраиваются на системном уровне XKB через org.gnome.desktop.input-sources xkb-options (прочие параметры XKB, такие как compose:* или lv3:*, сохраняются).',
    'None (system default)': 'Нет (системное значение по умолчанию)',
    'Alt+Shift (grp:alt_shift_toggle)': 'Alt+Shift (grp:alt_shift_toggle)',
    'Ctrl+Shift (grp:ctrl_shift_toggle)': 'Ctrl+Shift (grp:ctrl_shift_toggle)',
    'Caps Lock (grp:caps_toggle)': 'Caps Lock (grp:caps_toggle)',
    'XKB Modifier Toggle': 'Переключатель модификаторами XKB',
    'Configure system XKB modifier-only layout switching': 'Настройка переключения раскладок одними модификаторами на уровне XKB',
    'Win+Space (System switch-input-source)': 'Win+Space (системный switch-input-source)',
    'Indicates the built-in GNOME input-source switching shortcut': 'Отображает состояние встроенного сочетания GNOME для смены источника ввода',
    'System schema org.gnome.desktop.input-sources is unavailable': 'Системная схема org.gnome.desktop.input-sources недоступна',
    'Custom (%s)': 'Пользовательский (%s)',
    'Preserved XKB options: %s': 'Сохранённые параметры XKB: %s',
    'System schema org.gnome.desktop.wm.keybindings is unavailable': 'Системная схема org.gnome.desktop.wm.keybindings недоступна',
    'Unavailable': 'Недоступно',
    'Active in system keybindings: %s': 'Активно в системных привязках: %s',
    'Active': 'Активно',
    'Current system switch-input-source: %s (Win+Space not assigned)': 'Текущий системный switch-input-source: %s (Win+Space не назначен)',
    'Custom': 'Своё',
    'Overridden by a Liswitch shortcut above': 'Переопределено сочетанием Liswitch выше',
    'Overridden': 'Переопределено',
    'Disabled in system keybindings': 'Отключено в системных привязках',
    'Reset to default shortcut (%s)': 'Сбросить к сочетанию по умолчанию (%s)',
    'Press keys…': 'Нажмите клавиши…',
    'Press keys now — Escape to cancel, Backspace to disable': 'Нажмите клавиши сейчас — Escape для отмены, Backspace для отключения',
    'Shortcut "%s" is already assigned to "%s".': 'Сочетание "%s" уже назначено для "%s".',
    'Modifier-only shortcut cannot be bound in GNOME Shell: %s': 'Сочетание только из модификаторов не поддерживается в GNOME Shell: %s',
    'Conflict: shortcut "%s" is assigned to %s (%s)': 'Конфликт: сочетание "%s" назначено в %s (%s)',
    'Free in System': 'Освободить в системе',
    'Overriding system shortcut: %s (%s)': 'Переопределяет системное сочетание: %s (%s)',
    'Restore in System': 'Восстановить в системе',
    'Memory': 'Запоминание',
    'System Setting Conflict': 'Конфликт с системными настройками',
    'Notice regarding GNOME desktop input settings': 'Уведомление о параметрах ввода рабочего стола GNOME',
    'System "Per-Window" Switching Active ⚠️': 'В системе активно переключение "для каждого окна" ⚠️',
    'GNOME Settings has "Switch input sources individually for each window" enabled. To avoid duplicate switching conflicts, liswitch layout memory is suspended.': 'В настройках GNOME включена опция "Использовать разные источники ввода для каждого окна". Во избежание конфликтов и двойных переключений память раскладок liswitch приостановлена.',
    'Disable in System': 'Отключить в системе',
    'Layout Memory Mode': 'Режим памяти раскладок',
    'Remember and restore keyboard layout when switching between windows': 'Запоминать и восстанавливать раскладку при переключении между окнами',
    'Per-Application (recommended)': 'Для каждого приложения (рекомендуется)',
    'Per-Window': 'Для каждого окна',
    'Memory Mode': 'Режим памяти',
    'Choose how layouts are tracked across applications and windows': 'Выберите способ отслеживания раскладок для приложений и окон',
    'Keep active layout': 'Сохранять текущую раскладку',
    'Reset to first layout': 'Сбрасывать на первую раскладку',
    'New Windows Initial Layout': 'Начальная раскладка для новых окон',
    'Action when focusing a window that has no saved layout': 'Действие при переходе к окну, для которого нет сохраненной раскладки',
    'Excluded Applications': 'Исключенные приложения',
    'Applications that should be ignored by layout memory': 'Приложения, которые должны игнорироваться памятью раскладок',
    'Add application ID (e.g. org.gnome.Console)': 'Добавить идентификатор (напр. org.gnome.Console)',
    'Excluded List': 'Список исключений',
    'No applications excluded': 'Нет исключенных приложений',
    '%d application(s) excluded': 'Исключено приложений: %d',
    'Remove from excluded list': 'Удалить из списка исключений',
    'Search applications by name or ID…': 'Поиск приложений по названию или ID…',
    'No matching applications found': 'Подходящие приложения не найдены',
    'Added': 'Добавлено',
    'Per-App Starting Layout': 'Стартовая раскладка для приложений',
    'Force a specific layout when an application is focused for the first time': 'Принудительно включать выбранную раскладку при первом фокусе приложения',
    'Application ID (e.g. org.gnome.Console)': 'ID приложения (напр. org.gnome.Console)',
    'Choose from installed applications': 'Выбрать из установленных приложений',
    'Starting Layout': 'Стартовая раскладка',
    'Layout activated on first focus of this application': 'Раскладка, включаемая при первом фокусе этого приложения',
    'Add': 'Добавить',
    'Assign starting layout for this application': 'Назначить стартовую раскладку для этого приложения',
    'Configured Rules': 'Настроенные правила',
    'No per-app starting layouts configured': 'Стартовые раскладки для приложений не заданы',
    '%d application rule(s) configured': 'Настроено правил для приложений: %d',
    'Layout "%s" is not configured in system': 'Раскладка "%s" не настроена в системе',
    'Custom application ID': 'Пользовательский ID приложения',
    'Missing': 'Отсутствует',
    'Remove starting layout rule': 'Удалить правило стартовой раскладки',
    'No system layouts configured': 'Системные раскладки не настроены',
    'Select Application': 'Выбрать приложение',
    'Exclude Application': 'Исключить приложение',
    'About': 'О расширении',
    'Advanced keyboard layout switcher for GNOME Shell': 'Продвинутый переключатель раскладок клавиатуры для GNOME Shell',
    'Version %s': 'Версия %s',
    'Information': 'Информация',
    'Developer': 'Разработчик',
    'License': 'Лицензия',
    'Platform': 'Платформа',
    'Links & Support': 'Ссылки и поддержка',
    'Source Code': 'Исходный код',
    'Open project repository': 'Открыть репозиторий проекта',
    'Correction': 'Исправление текста',
    'Security & Privacy': 'Безопасность и конфиденциальность',
    'In-Memory Keystroke Buffer Notice': 'Уведомление о буфере нажатий клавиш в оперативной памяти',
    'When enabled, the extension maintains a temporary buffer of recent keystrokes (up to 64 chars) strictly in memory to convert text typed in the wrong layout (e.g. "ghbdtn" → "привет"). The buffer is automatically cleared on window focus changes, Enter, Tab, Esc, any modifier, or after 3 seconds of inactivity. Keystrokes are NEVER written to disk or logs.\n\n⚠️ Important: Wayland protocol isolates application surfaces. Extensions cannot detect password fields inside web browsers or third-party apps. Do not use this feature when entering sensitive passwords.': 'При включении расширение хранит временный буфер последних нажатий (до 64 символов) строго в оперативной памяти для конвертации текста, набранного не в той раскладке (напр. "ghbdtn" → "привет"). Буфер автоматически очищается при смене активного окна, нажатии Enter, Tab, Esc, любого модификатора или после 3 секунд бездействия. Нажатия клавиш НИКОГДА не сохраняются на диск и не логируются.\n\n⚠️ Важно: протокол Wayland изолирует окна приложений. Расширения не могут определять поля ввода паролей внутри веб-браузеров или сторонних программ. Не используйте данную функцию при вводе конфиденциальных паролей.',
    'Configuration': 'Конфигурация',
    'Enable Text Correction': 'Включить исправление текста',
    'Convert text typed in the wrong layout into the alternate language': 'Конвертировать текст, набранный не в той раскладке, на альтернативный язык',
    'Double Left Shift Trigger': 'Срабатывание по двойному левому Shift',
    'Press Left Shift twice quickly to convert the last typed word': 'Быстро нажмите левый Shift дважды для конвертации последнего набранного слова',
    'Convert Selected Text': 'Исправление выделенного текста',
    'When the typing buffer is empty, the manual hotkey copies, converts, and replaces selected text': 'Если буфер ввода пуст, горячая клавиша копирует, конвертирует и заменяет выделенный текст',
    'Manual Hotkey': 'Горячая клавиша ручного вызова',
    'Keyboard shortcut to manually trigger text conversion': 'Сочетание клавиш для ручного запуска конвертации текста',
    'Convert Last Word': 'Конвертировать последнее слово',
    'Shortcut to trigger conversion of the most recently typed word': 'Горячая клавиша для конвертации последнего набранного слова',
    'Terminal Applications': 'Приложения терминалов',
    'Applications where Ctrl+Shift+V and Ctrl+Shift+C are used instead of Ctrl+V and Ctrl+C': 'Приложения, в которых вместо Ctrl+V и Ctrl+C используются Ctrl+Shift+V и Ctrl+Shift+C',
    'Reset terminal list to defaults': 'Сбросить список терминалов к значениям по умолчанию',
    'Add terminal app ID or WM_CLASS (e.g. org.gnome.Console)': 'Добавить ID или WM_CLASS терминала (напр. org.gnome.Console)',
    'Configured Terminals': 'Настроенные терминалы',
    'No terminal applications configured': 'Приложения терминалов не настроены',
    '%d terminal(s) configured': 'Настроено терминалов: %d',
    'Remove from terminal list': 'Удалить из списка терминалов',
    'Reset to default shortcut (<Shift>Pause)': 'Сбросить к сочетанию по умолчанию (<Shift>Pause)',
    'Press keys… (Esc: cancel, Backspace: disable)': 'Нажмите клавиши… (Esc: отмена, Backspace: отключить)',
    'Keyboard layout: none configured': 'Раскладка клавиатуры: не настроена',
    'Keyboard layout: %s': 'Раскладка клавиатуры: %s',
    'Keyboard Layout Indicator': 'Индикатор раскладки клавиатуры',
    'No layouts configured': 'Раскладки не настроены',
    'Settings…': 'Настройки…',
}

kk_dict = {
    'Disabled': 'Сөндірулі',
    'General': 'Жалпы',
    'Panel Indicator': 'Панельдегі индикатор',
    'Configure the layout indicator in the top panel': 'Жоғарғы панельдегі пернетақта индикаторын баптау',
    'Show Indicator': 'Индикаторды көрсету',
    'Display the keyboard layout indicator in the top panel': 'Жоғарғы панельде пернетақта тілі индикаторын көрсету',
    'Hide System Indicator': 'Жүйелік индикаторды жасыру',
    'Hide standard GNOME keyboard indicator to prevent duplicates': 'Қайталануды болдырмау үшін GNOME стандартты индикаторын жасыру',
    'Scroll to Switch Layout': 'Тінтуір дөңгелегімен ауыстыру',
    'Switch layouts by scrolling the mouse wheel over the indicator': 'Индикатор үстінде тінтуір дөңгелегін айналдыру арқылы тілді ауыстыру',
    'Short (uppercase, e.g. EN)': 'Қысқаша (бас әріптер, мыс. EN)',
    'Full Name (e.g. English)': 'Толық атауы (мыс. English)',
    'Lowercase (e.g. en)': 'Кіші әріптер (мыс. en)',
    'Label Format': 'Белгі пішімі',
    'Choose how layout names appear in the panel': 'Панельде пернетақта тілінің қалай көрсетілетінін таңдаңыз',
    'Next to System Indicator': 'Жүйелік индикатордың жанында',
    'Right Panel Box': 'Панельдің оң жағы',
    'Center Panel Box': 'Панельдің ортасы',
    'Left Panel Box': 'Панельдің сол жағы',
    'Indicator Position': 'Индикатор орны',
    'Choose where the layout indicator appears in the top panel': 'Жоғарғы панельде тіл индикаторының орналасуын таңдаңыз',
    'On-Screen Display (OSD)': 'Экрандық хабарлама (OSD)',
    'Visual notification popup when switching layouts': 'Тілді ауыстырған кезде қалқымалы экрандық хабарлама',
    'Show OSD Pop-up': 'OSD хабарламасын көрсету',
    'Display a brief centered notification when layout changes': 'Тіл ауысқан кезде экран ортасында қысқаша хабарлама көрсету',
    'Display a brief notification when layout changes': 'Тіл ауысқан кезде қысқаша хабарлама көрсету',
    'Center of Screen': 'Экран ортасында',
    'Top of Screen': 'Экранның жоғарғы жағында',
    'Bottom of Screen': 'Экранның төменгі жағында',
    'OSD Position': 'OSD орны',
    'Vertical placement of the OSD notification on the active monitor': 'Белсенді монитордағы қалқымалы хабарламаның тік орналасуы',
    'OSD Duration': 'OSD ұзақтығы',
    'How long the OSD stays visible (in milliseconds)': 'Экрандық хабарламаның көріну ұзақтығы (миллисекундпен)',
    'Show OSD on Window Restore': 'Терезені қалпына келтіргенде OSD көрсету',
    'Display notification when layout is restored automatically by window memory': 'Терезе жады тілді автоматты түрде қалпына келтіргенде хабарлама көрсету',
    'Diagnostics': 'Диагностика',
    'Options for troubleshooting liswitch': 'liswitch жұмысын тексеру және баптау параметрлері',
    'Debug Logging': 'Жөндеу жазбалары',
    'Output detailed diagnostic messages to the system journal': 'Жүйелік журналға толық диагностикалық хабарламаларды жазу',
    'Shortcuts': 'Пернелер тіркесімдері',
    'Layout Switching Shortcuts': 'Тіл ауыстыру тіркесімдері',
    'Configure keybindings to switch between configured input sources': 'Енгізу көздері арасында ауысу үшін пернелер тіркесімдерін баптау',
    'Next Layout': 'Келесі тіл',
    'Cycle forward through available input sources': 'Қолжетімді тілдер бойынша алға қарай ауысу',
    'Previous Layout': 'Алдыңғы тіл',
    'Cycle backward through available input sources': 'Қолжетімді тілдер бойынша артқа қарай ауысу',
    'Direct Layout Selection': 'Тілді тікелей таңдау',
    'Jump directly to a specific layout by number (1 to 4)': 'Нөмірі бойынша белгілі бір тілге тікелей өту (1-ден 4-ке дейін)',
    'Switch to Layout %d': '%d тіліне ауысу',
    'Directly activate layout at index %d': '%d индексіндегі тілді тікелей белсендіру',
    'Modifier-Only Switching (System XKB)': 'Тек модификаторлармен ауыстыру (жүйелік XKB)',
    'GNOME Shell keybindings require a non-modifier key. Pure modifier combinations are configured at the system XKB level via org.gnome.desktop.input-sources xkb-options (other XKB options such as compose:* or lv3:* are preserved).': 'GNOME Shell пернелер тіркесімі модификатор емес пернені қажет етеді. Тек модификаторлардан тұратын тіркесімдер жүйелік XKB деңгейінде org.gnome.desktop.input-sources xkb-options арқылы бапталады (compose:* немесе lv3:* сияқты басқа XKB параметрлері сақталады).',
    'None (system default)': 'Жоқ (жүйелік әдепкі мән)',
    'Alt+Shift (grp:alt_shift_toggle)': 'Alt+Shift (grp:alt_shift_toggle)',
    'Ctrl+Shift (grp:ctrl_shift_toggle)': 'Ctrl+Shift (grp:ctrl_shift_toggle)',
    'Caps Lock (grp:caps_toggle)': 'Caps Lock (grp:caps_toggle)',
    'XKB Modifier Toggle': 'XKB модификаторлы ауыстырғышы',
    'Configure system XKB modifier-only layout switching': 'Жүйелік XKB деңгейінде тек модификаторлармен тіл ауыстыруды баптау',
    'Win+Space (System switch-input-source)': 'Win+Space (жүйелік switch-input-source)',
    'Indicates the built-in GNOME input-source switching shortcut': 'Кіріктірілген GNOME енгізу көзін ауыстыру тіркесімінің күйін көрсетеді',
    'System schema org.gnome.desktop.input-sources is unavailable': 'org.gnome.desktop.input-sources жүйелік сызбасы қолжетімсіз',
    'Custom (%s)': 'Пайдаланушы (%s)',
    'Preserved XKB options: %s': 'Сақталған XKB параметрлері: %s',
    'System schema org.gnome.desktop.wm.keybindings is unavailable': 'org.gnome.desktop.wm.keybindings жүйелік сызбасы қолжетімсіз',
    'Unavailable': 'Қолжетімсіз',
    'Active in system keybindings: %s': 'Жүйелік тіркесімдерде белсенді: %s',
    'Active': 'Белсенді',
    'Current system switch-input-source: %s (Win+Space not assigned)': 'Ағымдағы жүйелік switch-input-source: %s (Win+Space тағайындалмаған)',
    'Custom': 'Өзгеше',
    'Overridden by a Liswitch shortcut above': 'Жоғарыдағы Liswitch тіркесімімен қайта анықталған',
    'Overridden': 'Қайта анықталған',
    'Disabled in system keybindings': 'Жүйелік тіркесімдерде сөндірулі',
    'Reset to default shortcut (%s)': 'Әдепкі тіркесімге қайтару (%s)',
    'Press keys…': 'Пернелерді басыңыз…',
    'Press keys now — Escape to cancel, Backspace to disable': 'Пернелерді қазір басыңыз — бас тарту үшін Escape, сөндіру үшін Backspace',
    'Shortcut "%s" is already assigned to "%s".': '"%s" тіркесімі әлдеқашан "%s" әрекетіне тағайындалған.',
    'Modifier-only shortcut cannot be bound in GNOME Shell: %s': 'Тек модификаторлардан тұратын тіркесім GNOME Shell-де қолданылмайды: %s',
    'Conflict: shortcut "%s" is assigned to %s (%s)': 'Қақтығыс: "%s" тіркесімі %s (%s) ішінде тағайындалған',
    'Free in System': 'Жүйеде босату',
    'Overriding system shortcut: %s (%s)': 'Жүйелік тіркесімді қайта анықтау: %s (%s)',
    'Restore in System': 'Жүйеде қалпына келтіру',
    'Memory': 'Есте сақтау',
    'System Setting Conflict': 'Жүйелік баптаулармен қақтығыс',
    'Notice regarding GNOME desktop input settings': 'GNOME жұмыс үстелінің енгізу баптаулары туралы ескерту',
    'System "Per-Window" Switching Active ⚠️': 'Жүйеде "әр терезе үшін" ауыстыру қосулы ⚠️',
    'GNOME Settings has "Switch input sources individually for each window" enabled. To avoid duplicate switching conflicts, liswitch layout memory is suspended.': 'GNOME баптауларында "Әрбір терезе үшін бөлек енгізу көздерін ауыстыру" қосулы. Қақтығыстарды болдырмау үшін liswitch жады тоқтатылды.',
    'Disable in System': 'Жүйеде сөндіру',
    'Layout Memory Mode': 'Тілді есте сақтау режимі',
    'Remember and restore keyboard layout when switching between windows': 'Терезелер арасында ауысқан кезде пернетақта тілін есте сақтау және қалпына келтіру',
    'Per-Application (recommended)': 'Әр қолданба үшін (ұсынылады)',
    'Per-Window': 'Әр терезе үшін',
    'Memory Mode': 'Есте сақтау режимі',
    'Choose how layouts are tracked across applications and windows': 'Қолданбалар мен терезелер бойынша тілді қадағалау тәсілін таңдаңыз',
    'Keep active layout': 'Ағымдағы тілді сақтау',
    'Reset to first layout': 'Бірінші тілге қайтару',
    'New Windows Initial Layout': 'Жаңа терезелер үшін бастапқы тіл',
    'Action when focusing a window that has no saved layout': 'Сақталған тілі жоқ терезеге өткен кездегі әрекет',
    'Excluded Applications': 'Ерекшеленген қолданбалар',
    'Applications that should be ignored by layout memory': 'Тіл жады ескермеуі керек қолданбалар',
    'Add application ID (e.g. org.gnome.Console)': 'Қолданба идентификаторын қосу (мыс. org.gnome.Console)',
    'Excluded List': 'Ерекшеліктер тізімі',
    'No applications excluded': 'Ерекшеленген қолданбалар жоқ',
    '%d application(s) excluded': '%d қолданба ерекшеленді',
    'Remove from excluded list': 'Ерекшеліктер тізімінен өшіру',
    'Search applications by name or ID…': 'Қолданбаларды атауы немесе ID бойынша іздеу…',
    'No matching applications found': 'Сәйкес қолданбалар табылмады',
    'Added': 'Қосылды',
    'Per-App Starting Layout': 'Қолданбалар үшін бастапқы тіл',
    'Force a specific layout when an application is focused for the first time': 'Қолданбаға алғаш рет өткен кезде таңдалған тілді мәжбүрлеп қосу',
    'Application ID (e.g. org.gnome.Console)': 'Қолданба ID (мыс. org.gnome.Console)',
    'Choose from installed applications': 'Орнатылған қолданбалардан таңдау',
    'Starting Layout': 'Бастапқы тіл',
    'Layout activated on first focus of this application': 'Осы қолданбаға алғаш рет өткенде қосылатын тіл',
    'Add': 'Қосу',
    'Assign starting layout for this application': 'Осы қолданба үшін бастапқы тілді тағайындау',
    'Configured Rules': 'Бапталған ережелер',
    'No per-app starting layouts configured': 'Қолданбалар үшін бастапқы тілдер бапталмаған',
    '%d application rule(s) configured': '%d қолданба ережесі бапталды',
    'Layout "%s" is not configured in system': '"%s" тілі жүйеде бапталмаған',
    'Custom application ID': 'Пайдаланушы қолданба ID',
    'Missing': 'Табылмады',
    'Remove starting layout rule': 'Бастапқы тіл ережесін өшіру',
    'No system layouts configured': 'Жүйелік тілдер бапталмаған',
    'Select Application': 'Қолданбаны таңдау',
    'Exclude Application': 'Қолданбаны ерекшелеу',
    'About': 'Кеңейтім туралы',
    'Advanced keyboard layout switcher for GNOME Shell': 'GNOME Shell үшін жетілдірілген пернетақта тілін ауыстырғыш',
    'Version %s': 'Нұсқасы %s',
    'Information': 'Ақпарат',
    'Developer': 'Әзірлеуші',
    'License': 'Лицензия',
    'Platform': 'Платформа',
    'Links & Support': 'Сілтемелер мен қолдау',
    'Source Code': 'Бастапқы код',
    'Open project repository': 'Жоба қоймасын ашу',
    'Correction': 'Мәтінді түзету',
    'Security & Privacy': 'Қауіпсіздік және құпиялылық',
    'In-Memory Keystroke Buffer Notice': 'Жадел жадтағы перне басу буфері туралы ескерту',
    'When enabled, the extension maintains a temporary buffer of recent keystrokes (up to 64 chars) strictly in memory to convert text typed in the wrong layout (e.g. "ghbdtn" → "привет"). The buffer is automatically cleared on window focus changes, Enter, Tab, Esc, any modifier, or after 3 seconds of inactivity. Keystrokes are NEVER written to disk or logs.\n\n⚠️ Important: Wayland protocol isolates application surfaces. Extensions cannot detect password fields inside web browsers or third-party apps. Do not use this feature when entering sensitive passwords.': 'Қосулы болғанда, кеңейтім қате тілде терілген мәтінді түрлендіру үшін соңғы басылған пернелердің (64 таңбаға дейін) уақытша буферін тек жедел жадта сақтайды (мыс. "ghbdtn" → "привет"). Терезе ауысқанда, Enter, Tab, Esc басылғанда немесе 3 секунд әрекетсіздіктен кейін буфер тазаланады. Перне басулары ЕШҚАШАН дискіге жазылмайды.\n\n⚠️ Маңызды: Wayland қолданбалар беттерін оқшаулайды. Кеңейтімдер браузерлерде құпиясөз өрістерін анықтай алмайды. Құпиясөздерді енгізген кезде бұл мүмкіндікті қолданбаңыз.',
    'Configuration': 'Баптаулар',
    'Enable Text Correction': 'Мәтінді түзетуді қосу',
    'Convert text typed in the wrong layout into the alternate language': 'Қате тілде терілген мәтінді балама тілге түрлендіру',
    'Double Left Shift Trigger': 'Сол жақ Shift қос басу арқылы іске қосу',
    'Press Left Shift twice quickly to convert the last typed word': 'Соңғы терілген сөзді түрлендіру үшін сол жақ Shift пернесін жылдам екі рет басыңыз',
    'Convert Selected Text': 'Ерекшеленген мәтінді түзету',
    'When the typing buffer is empty, the manual hotkey copies, converts, and replaces selected text': 'Теру буфері бос болса, пернелер тіркесімі ерекшеленген мәтінді көшіріп, түрлендіреді және ауыстырады',
    'Manual Hotkey': 'Қолмен шақыру пернесі',
    'Keyboard shortcut to manually trigger text conversion': 'Мәтінді түрлендіруді қолмен іске қосуға арналған пернелер тіркесімі',
    'Convert Last Word': 'Соңғы сөзді түрлендіру',
    'Shortcut to trigger conversion of the most recently typed word': 'Соңғы терілген сөзді түрлендіру пернесі',
    'Terminal Applications': 'Терминал қолданбалары',
    'Applications where Ctrl+Shift+V and Ctrl+Shift+C are used instead of Ctrl+V and Ctrl+C': 'Ctrl+V және Ctrl+C орнына Ctrl+Shift+V және Ctrl+Shift+C қолданылатын қолданбалар',
    'Reset terminal list to defaults': 'Терминалдар тізімін әдепкі мәндерге қайтару',
    'Add terminal app ID or WM_CLASS (e.g. org.gnome.Console)': 'Терминал ID немесе WM_CLASS қосу (мыс. org.gnome.Console)',
    'Configured Terminals': 'Бапталған терминалдар',
    'No terminal applications configured': 'Терминал қолданбалары бапталмаған',
    '%d terminal(s) configured': '%d терминал бапталды',
    'Remove from terminal list': 'Терминалдар тізімінен өшіру',
    'Reset to default shortcut (<Shift>Pause)': 'Әдепкі тіркесімге қайтару (<Shift>Pause)',
    'Press keys… (Esc: cancel, Backspace: disable)': 'Пернелерді басыңыз… (Esc: бас тарту, Backspace: сөндіру)',
    'Keyboard layout: none configured': 'Пернетақта тілі: бапталмаған',
    'Keyboard layout: %s': 'Пернетақта тілі: %s',
    'Keyboard Layout Indicator': 'Пернетақта тілі индикаторы',
    'No layouts configured': 'Тілдер бапталмаған',
    'Settings…': 'Баптаулар…',
}

def format_msgstr(trans):
    lines = trans.split('\n')
    if len(lines) == 1:
        esc = json.dumps(lines[0], ensure_ascii=False)
        return f'msgstr {esc}'
    else:
        out = 'msgstr ""\n'
        for i, line in enumerate(lines):
            esc = json.dumps(line + ('\n' if i < len(lines) - 1 else ''), ensure_ascii=False)
            out += f'{esc}\n'
        return out.rstrip()

def generate_po(lang_code, lang_name, trans_map, out_file):
    with open('po/liswitch.pot', 'r', encoding='utf-8') as f:
        pot_lines = f.readlines()

    header = f'''# {lang_name} translation for liswitch.
# Copyright (C) 2026 Liswitch Project
# This file is distributed under the same license as the liswitch package.
#
msgid ""
msgstr ""
"Project-Id-Version: liswitch 1.0.0\\n"
"Report-Msgid-Bugs-To: https://github.com/liswitch/liswitch/issues\\n"
"POT-Creation-Date: 2026-11-14 21:22+0500\\n"
"PO-Revision-Date: 2026-11-14 22:00+0500\\n"
"Last-Translator: Liswitch Team\\n"
"Language-Team: {lang_name}\\n"
"Language: {lang_code}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"

'''
    entries = []
    current_comments = []
    current_raw_msgid = []
    is_msgid = False

    for line in pot_lines:
        line_str = line.rstrip('\r\n')
        if line_str.startswith('#'):
            current_comments.append(line_str)
        elif line_str.startswith('msgid '):
            current_raw_msgid = [line_str[6:].strip()]
            is_msgid = True
        elif is_msgid and line_str.startswith('"'):
            current_raw_msgid.append(line_str.strip())
        elif line_str.startswith('msgstr '):
            is_msgid = False
            # parse JSON string of msgid
            if current_raw_msgid:
                try:
                    parsed_msgid = ''.join(json.loads(rl) for rl in current_raw_msgid)
                    if parsed_msgid:  # skip header msgid ""
                        entries.append((list(current_comments), parsed_msgid, list(current_raw_msgid)))
                except Exception as e:
                    print(f"Error parsing {current_raw_msgid}: {e}")
            current_comments.clear()
            current_raw_msgid = []

    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(header)
        for comments, msgid, raw_lines in entries:
            for c in comments:
                f.write(f'{c}\n')
            
            if len(raw_lines) == 1:
                f.write(f'msgid {raw_lines[0]}\n')
            else:
                f.write('msgid ""\n')
                for rl in raw_lines[1:]:
                    f.write(f'{rl}\n')
            
            trans = trans_map.get(msgid, '')
            if not trans:
                print(f"Warning: untranslated msgid: {repr(msgid)}")
                f.write('msgstr ""\n\n')
            else:
                f.write(format_msgstr(trans) + '\n\n')

    print(f'Generated {out_file} ({len(entries)} entries)')

if __name__ == '__main__':
    generate_po('ru', 'Russian', ru_dict, 'po/ru.po')
    generate_po('kk', 'Kazakh', kk_dict, 'po/kk.po')
