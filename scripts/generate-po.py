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
    'On-Screen Display (OSD)': 'Экранное уведомление (OSD)',
    'Visual notification popup when switching layouts': 'Всплывающее экранное уведомление при смене раскладки',
    'Show OSD Pop-up': 'Показывать всплывающее OSD',
    'Display a brief centered notification when layout changes': 'Показывать краткое уведомление по центру экрана при смене раскладки',
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
    'Modifier-Only Shortcuts Note': 'Примечание о сочетаниях из одних модификаторов',
    'GNOME Shell keybindings require a non-modifier key (like Space, Letter, or Digit). Pure modifier combinations (such as Alt+Shift or Caps Lock) cannot be assigned via extension keybindings; they are managed at the system XKB level in Settings → Keyboard → Special Character Entry or GNOME Tweaks.': 'Для горячих клавиш GNOME Shell требуется клавиша, не являющаяся модификатором (пробел, буква или цифра). Сочетания только из модификаторов (такие как Alt+Shift или Caps Lock) невозможно привязать через расширение; они управляются на системном уровне XKB в Параметры → Клавиатура → Ввод спецсимволов или через GNOME Tweaks.',
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
    'About': 'О расширении',
    'Advanced keyboard layout switcher for GNOME Shell 51': 'Продвинутый переключатель раскладок клавиатуры для GNOME Shell 51',
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
    'Manual Hotkey': 'Горячая клавиша ручного вызова',
    'Keyboard shortcut to manually trigger text conversion': 'Сочетание клавиш для ручного запуска конвертации текста',
    'Convert Last Word': 'Конвертировать последнее слово',
    'Shortcut to trigger conversion of the most recently typed word': 'Горячая клавиша для конвертации последнего набранного слова',
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
    'On-Screen Display (OSD)': 'Экрандық хабарлама (OSD)',
    'Visual notification popup when switching layouts': 'Тілді ауыстырған кезде қалқымалы экрандық хабарлама',
    'Show OSD Pop-up': 'OSD хабарламасын көрсету',
    'Display a brief centered notification when layout changes': 'Тіл ауысқан кезде экран ортасында қысқаша хабарлама көрсету',
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
    'Modifier-Only Shortcuts Note': 'Тек модификаторлық пернелер тіркесімі туралы ескертпе',
    'GNOME Shell keybindings require a non-modifier key (like Space, Letter, or Digit). Pure modifier combinations (such as Alt+Shift or Caps Lock) cannot be assigned via extension keybindings; they are managed at the system XKB level in Settings → Keyboard → Special Character Entry or GNOME Tweaks.': 'GNOME Shell пернелер тіркесімі модификатор емес пернені қажет етеді (бос орын, әріп немесе сан). Тек модификаторлардан тұратын тіркесімдерді (мысалы, Alt+Shift немесе Caps Lock) кеңейтім арқылы тағайындау мүмкін емес; олар жүйелік XKB деңгейінде Баптаулар → Пернетақта бөлімінде басқарылады.',
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
    'About': 'Кеңейтім туралы',
    'Advanced keyboard layout switcher for GNOME Shell 51': 'GNOME Shell 51 үшін жетілдірілген пернетақта тілін ауыстырғыш',
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
    'Manual Hotkey': 'Қолмен шақыру пернесі',
    'Keyboard shortcut to manually trigger text conversion': 'Мәтінді түрлендіруді қолмен іске қосуға арналған пернелер тіркесімі',
    'Convert Last Word': 'Соңғы сөзді түрлендіру',
    'Shortcut to trigger conversion of the most recently typed word': 'Соңғы терілген сөзді түрлендіру пернесі',
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
"Project-Id-Version: liswitch 51.0\\n"
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
