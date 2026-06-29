# TaskFlow — учебный проект курса «Git: от базы до про»

**TaskFlow** — это сквозной учебный проект практического курса по Git. Маленький
менеджер задач на Vite + React + TypeScript, на котором отрабатывается **весь путь
реальной фичи**: ветка → коммиты → ревью → конфликт → релиз → хотфикс → откат.

Содержимое приложения вторично. Важно, что в нём есть несколько файлов, которые удобно
править параллельно (чтобы детерминированно ставить конфликты), логически делить на
«фичи», «багфиксы» и «релизы», и в которые можно спрятать регрессию для `git bisect`.

> 💡 Почему отдельный учебный проект, а не реальный: на учебном репозитории можно
> срежиссировать любую сцену — гарантированный конфликт при rebase, специально
> сломанный коммит для bisect, «секрет» для вычистки из истории. На продакшене такое
> либо опасно, либо не воспроизводится.

---

## 📚 Программа курса по модулям

Каждый модуль — отдельный пошаговый документ в одинаковом формате:
**цель → мысленная модель → команды с реальными выводами и построчным разбором →
типичные ошибки → чек-лист → шпаргалка → домашнее задание**. Все выводы команд в
документах — настоящие (сняты на реальных прогонах); у вас будут отличаться только
хеши SHA-1, потому что они зависят от содержимого, автора и времени коммита.

| #   | Модуль                                    | О чём                                                                                                  | Документ                               |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 0   | Основания и мысленная модель              | snapshots, три дерева, объектная модель (blob/tree/commit), `cat-file`                                 | [docs/module-0.md](docs/module-0.md)   |
| 1   | Ежедневный рабочий цикл                   | `status`/`add -p`/`commit`/`diff`/`restore`/`amend`, атомарные коммиты                                 | [docs/module-1.md](docs/module-1.md)   |
| 2   | Гигиена репозитория                       | что не коммитят, `.gitignore` и его синтаксис, `git rm --cached`, `.gitattributes`                     | [docs/module-2.md](docs/module-2.md)   |
| 3   | Ветки и слияния                           | `switch`, fast-forward vs 3-way merge, `--no-ff`, разрешение конфликтов                                | [docs/module-3.md](docs/module-3.md)   |
| 4   | Теги — релизные метки                     | лёгкий vs аннотированный, тег на любой коммит, semver (локально)                                       | [docs/module-4.md](docs/module-4.md)   |
| 5   | Создание удалёнки и клонирование          | репозиторий на GitHub, `remote add`/`push -u`, публикация тегов, clone по HTTPS/SSH/ZIP, clone vs fork | [docs/module-5.md](docs/module-5.md)   |
| 6   | Удалённые репозитории и совместная работа | `fetch` vs `pull`, tracking-ветки/upstream, Pull Request, ревью, защита веток                          | [docs/module-6.md](docs/module-6.md)   |
| 7   | Переписывание истории: rebase             | `rebase`, interactive rebase (squash/fixup/reword/edit/drop/reorder), `--force-with-lease`             | [docs/module-7.md](docs/module-7.md)   |
| 8   | Восстановление и хирургия по истории      | `reflog`, `reset` (soft/mixed/hard), `revert`, `cherry-pick`, `stash`, `bisect`                        | [docs/module-8.md](docs/module-8.md)   |
| 9   | Патчи: обмен изменениями через файлы       | `git diff`/`apply` (`--check`/`-R`/`--3way`), `format-patch`/`am`, патч vs PR/cherry-pick              | [docs/module-9.md](docs/module-9.md)   |
| 10  | Про-инструментарий                        | хуки (Husky/commitlint), `rerere`, worktrees, `filter-repo`, подпись коммитов, plumbing                | [docs/module-10.md](docs/module-10.md) |
| 11  | Командные workflow и стратегии            | Git Flow / GitHub Flow / trunk-based, Conventional Commits, semver, CHANGELOG, CI/CD                   | [docs/module-11.md](docs/module-11.md) |
| 12  | Капстоун — «всё сразу»                    | полный жизненный цикл фичи на одном командном сценарии                                                 | [docs/module-12.md](docs/module-12.md) |

В каждом модуле есть раздел **«Домашнее задание»**: оно отрабатывает навыки урока, но
на отдельном сценарии — **не дублирует** разобранный в документе живой пример.

---

## 🛠 Стек

- [Vite](https://vite.dev/) — сборка и dev-сервер
- React 18 + TypeScript
- [Vitest](https://vitest.dev/) — тесты (используются в модуле bisect: `git bisect run npm test`)

## ▶️ Запуск

```bash
npm install
npm run dev       # дев-сервер на http://localhost:5173
npm test          # прогон тестов (vitest run)
npm run build     # продакшен-сборка
```

## 🗂 Структура

```
taskflow/
├─ README.md
├─ docs/                       # пошаговые документы модулей курса
│  ├─ module-0.md … module-12.md
├─ package.json
├─ .gitignore
├─ .gitattributes
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ components/
│  │  ├─ TaskList.tsx
│  │  └─ TaskItem.tsx
│  ├─ state/
│  │  └─ tasksStore.ts
│  ├─ utils/
│  │  └─ taskUtils.ts        # «горячий» файл для постановки конфликтов
│  └─ styles/
│     └─ app.css
└─ tests/
   └─ taskUtils.test.ts
```

## 🎬 Где режиссировать «сцены» курса

- **Конфликты (модули 3, 12):** меняйте `src/utils/taskUtils.ts` (`sortTasks`/`filterTasks`)
  и/или `src/state/tasksStore.ts` в двух ветках, правя один и тот же блок.
- **Bisect (модуль 8):** внедрите регрессию в `taskUtils.ts`, которую ловит
  `tests/taskUtils.test.ts`, затем `git bisect run npm test`.
- **Фичи (модули 1, 3):** «отметить выполненной», фильтры/сортировка/приоритеты — в
  `TaskItem.tsx`, `tasksStore.ts` и `App.tsx`.

---

## Как проходить курс

1. Открывайте документ модуля и повторяйте шаги в своём клоне репозитория.
2. Сверяйте свои выводы с приведёнными в документе (отличаться будут только хеши).
3. В конце каждого модуля выполняйте **домашнее задание** и проверяйте себя по
   критериям «сделано».
