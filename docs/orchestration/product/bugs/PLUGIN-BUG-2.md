# PLUGIN-BUG-2 — report --check не проходит собственную анонимизацию, когда владелец origin = организация плагина

| Поле | Значение |
|------|----------|
| Найден | 2026-10-07, попытка записать PLUGIN-BUG-1 |
| Окружение | pepper-orchestrator 0.11.0, Claude Code 2.1.292, Ubuntu 24.04, Python 3.12 |
| Модуль | плагин: orch.py report --check / plugin_report.leaks |
| Серьёзность | medium |
| Статус | открыт |
| Issue | https://github.com/ITSalt/PepperSkills/issues/33 |

## Симптом
`report --check` отказывает: «the report still looks private after anonymization (name from orch.yaml (6 characters))» при любом логе, даже однострочном без имён.

## Воспроизведение
1. Рабочее пространство в репозитории организации, в которой живёт и плагин.
2. `orch.py report --check ... --log <1 строка>`.

## Ожидалось и получено
Ожидалось: запись bugs/PLUGIN-BUG-n.md. Получено: отказ; трассировка leaks показывает совпадение имени владельца origin внутри шаблона самого плагина («Текст для публикации в `…/PepperSkills`»).

## Подтверждение
Журнал status.md 2026-10-07 («Дефект плагина не записан…»); трассировка plugin_report.leaks в этой сессии.

## Причина
Шаблон записи содержит имя организации плагина; оно совпадает с `<home-origin-owner>` и ловится финальным сканом.

## Issue
https://github.com/ITSalt/PepperSkills/issues/33
