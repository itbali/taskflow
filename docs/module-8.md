# Модуль 8. Страховочная сетка: reflog и reset

> **Цель модуля.** Перестать бояться Git: почти всё в нём восстановимо. К концу
> модуля вы своими словами объясняете, чем различаются **soft / mixed / hard**
> режимы `reset`, делаете `git reflog` первым рефлексом при «потере» коммитов и
> понимаете, когда `reset` вообще безопасен применять.

Этот документ — пошаговый разбор «живого примера» модуля 8 на проекте `taskflow`.
Все выводы команд ниже — **настоящие**. Чтобы не задеть `main`, всю «хирургию» делаем в
**отдельной учебной ветке** — все «поломки» происходят там, а `main` остаётся цел.
Единственное, что у вас будет отличаться, — это сами хеши (SHA-1), а в `reflog` будут и
более ранние записи из прошлых модулей (ориентируйтесь на верхние — это ваши свежие
действия).

> 💡 Чтобы команды Git не открывали редактор и не блокировали запись урока, в примерах
> использовались флаг `-m "..."` и переменная `GIT_EDITOR=true`. В реальной работе
> сообщения вы пишете в своём редакторе как обычно.

> 💡 **Откат опубликованного коммита** (`revert`), **перенос отдельного коммита** между
> ветками (`cherry-pick`) и поиск регрессии (`bisect`) — отдельная тема, вынесенная в
> [модуль 10](module-10.md). Здесь мы разбираем только «локальную» перемотку истории:
> `reflog` и `reset`.

---

## Мысленная модель (прочитать до команд)

Две идеи, на которых держится весь модуль.

1. **reflog — это страховочная сетка.** Каждый раз, когда `HEAD` куда-то двигается
   (commit, checkout, reset, rebase, merge), Git дописывает строку в `reflog`. Это
   локальный журнал «где был HEAD». Даже если коммит больше не виден в `git log` (на
   него не указывает ни одна ветка), объект ещё лежит в `.git/objects` и достижим
   через `reflog` — обычно \~90 дней, пока не отработает `git gc`. Поэтому первый
   рефлекс при «я всё потерял» — не паника, а `git reflog`.

2. **Три режима reset = насколько глубоко откатываемся.** `reset <ref>` всегда двигает
   ветку на `<ref>`, а флаг решает судьбу index и working tree:

   ```
                       двигает HEAD?   трогает index?   трогает working tree?
   git reset --soft     да              нет              нет
   git reset --mixed    да              да               нет     (режим по умолчанию)
   git reset --hard     да              да               да      (УНИЧТОЖАЕТ правки!)
   ```

   - `--soft` — коммиты «распаковались» обратно в index (удобно пересобрать коммит).
   - `--mixed` — изменения вернулись в working tree, но не в index (надо снова `add`).
   - `--hard` — изменения **стёрты**. Незакоммиченные правки после `--hard` reflog
     уже не вернёт (их не было в коммитах).

   `reset` двигает указатель ветки — это **переписывание истории**: опасно для уже
   **опубликованных** (запушенных) коммитов, у коллег история разъедется. Применяйте
   его к локальным, ещё не отправленным коммитам. Штатный способ отменить
   опубликованный коммит без переписывания истории — `git revert` (модуль 10).

---

## Шаг 0. Готовим площадку

Всё делаем в своём `taskflow`. Чтобы экспериментировать без риска, «поломку» устраиваем
в **отдельной учебной ветке** от `main` — её и будем ломать. `main` при этом не
трогается, поэтому даже `reset --hard` безопасен: он затронет только учебную ветку, а
исходные коммиты останутся достижимы через `reflog`.

> 💡 `reflog` — журнал перемещений `HEAD` по **всему** репозиторию, поэтому у вас в нём
> будут и записи из прошлых модулей. В примерах ниже показаны только свежие, верхние
> строки — на них и ориентируйтесь.

---

## Шаг 1. «Случайный» `reset --hard` и спасение через reflog

Заведём ветку с двумя коммитами в «горячем» файле `src/utils/taskUtils.ts` — их и будем
«терять». Добавим точечный поиск задачи по `id`, сначала заглушкой, потом реализацией
(типичная последовательность коммитов «stub → impl»).

```bash
git checkout -b feature/lookup
cat >> src/utils/taskUtils.ts <<'EOF'

/** Найти задачу по id (заглушка). */
export function getTaskById(tasks: Task[], id: string): Task | undefined {
  return undefined
}
EOF
git add src/utils/taskUtils.ts && git commit -m "feat: add getTaskById stub"
# заменили тело функции на реальный поиск
git add src/utils/taskUtils.ts && git commit -m "feat: implement getTaskById lookup"
git log --oneline -4
```

**Вывод:**

```
188df8c feat: implement getTaskById lookup
fe08cff feat: add getTaskById stub
b71ece7 chore: add .gitattributes for line-ending normalization
8c9e1c3 chore: stop tracking deps and build artifacts, add .gitignore
```

Теперь «катастрофа»: думали откатить рабочие правки, а снесли два коммита.

```bash
git reset --hard HEAD~2
git log --oneline -3
```

**Вывод:**

```
HEAD is now at b71ece7 chore: add .gitattributes for line-ending normalization
b71ece7 chore: add .gitattributes for line-ending normalization
8c9e1c3 chore: stop tracking deps and build artifacts, add .gitignore
a5d26e5 chore: add dependencies and build
```

Коммитов `feat: add getTaskById stub` и `feat: implement getTaskById lookup` в
`git log` больше нет. **Но они не исчезли.** Смотрим страховочную сетку:

```bash
git reflog
```

**Вывод:**

```
b71ece7 HEAD@{0}: reset: moving to HEAD~2
188df8c HEAD@{1}: commit: feat: implement getTaskById lookup
fe08cff HEAD@{2}: commit: feat: add getTaskById stub
b71ece7 HEAD@{3}: checkout: moving from main to feature/lookup
b71ece7 HEAD@{4}: clone: from /home/.../taskflow
```

**Объяснение построчно:**
- `HEAD@{0}` — последнее, что мы сделали: `reset` назад. Сюда `HEAD` указывает сейчас.
- `HEAD@{1}` = `188df8c` — вот он, «потерянный» верхний коммит. Хеш цел.
- `HEAD@{2}`, `HEAD@{3}`, `HEAD@{4}` — вся предыдущая траектория `HEAD`: коммиты,
  checkout, сам clone. Это и есть журнал движений указателя.

Чтобы вернуться, делаем `reset --hard` уже **вперёд**, на сохранённый хеш:

```bash
git reset --hard 188df8c
git log --oneline -4
```

**Вывод:**

```
HEAD is now at 188df8c feat: implement getTaskById lookup
188df8c feat: implement getTaskById lookup
fe08cff feat: add getTaskById stub
b71ece7 chore: add .gitattributes for line-ending normalization
8c9e1c3 chore: stop tracking deps and build artifacts, add .gitignore
```

Оба коммита и функция `getTaskById` в `src/utils/taskUtils.ts` на месте. **Reflog —
первый рефлекс при «потере».**

> 💡 Вместо хеша можно адресовать `git reset --hard HEAD@{1}` — синтаксис reflog
> понимает «где был HEAD один шаг назад».

---

## Шаг 2. soft / mixed / hard на одном примере

Теперь наглядно, чем режимы reset отличаются. Каждый раз откатываем один и тот же
верхний коммит (`188df8c`) и смотрим `git status -s` (`M ` слева = staged, ` M` справа
= unstaged).

### 2.1. `--soft` — изменения остаются в index

```bash
git reset --soft HEAD~1
git status -s
git log --oneline -2
```

**Вывод:**

```
M  src/utils/taskUtils.ts
fe08cff feat: add getTaskById stub
b71ece7 chore: add .gitattributes for line-ending normalization
```

`M ` (символ в **первой** колонке) — файл **в индексе**, готов к коммиту. Коммит
«распаковался» обратно в staging. Удобно, когда хочется пересобрать последний коммит
другим сообщением или объединить с новыми правками.

### 2.2. `--mixed` (по умолчанию) — изменения в working tree, индекс сброшен

```bash
git reset --hard 188df8c   # вернули коммит обратно
git reset --mixed HEAD~1
git status -s
```

**Вывод:**

```
Unstaged changes after reset:
M	src/utils/taskUtils.ts
 M src/utils/taskUtils.ts
```

` M` (символ во **второй** колонке) — файл изменён в working tree, но **не** в индексе.
Это режим по умолчанию: после отката нужно снова сделать `git add`, чтобы вернуть в коммит.

### 2.3. `--hard` — изменения уничтожены

```bash
git reset --hard 188df8c   # вернули коммит обратно
git reset --hard HEAD~1
git status -s
git log --oneline -2
```

**Вывод:**

```
HEAD is now at fe08cff feat: add getTaskById stub
fe08cff feat: add getTaskById stub
b71ece7 chore: add .gitattributes for line-ending normalization
```

`git status -s` **пуст** — working tree чистый, реализация из `188df8c` стёрта с диска
(остался только stub). Сам коммит ещё в reflog (его можно вернуть), а вот
**незакоммиченные** правки после `--hard` не вернёт никто. Поэтому `--hard` — самая
опасная форма reset.

---

## Типичные ошибки модуля 8

- ❌ **`reset --hard` без понимания.** Стирает незакоммиченные правки безвозвратно
  (reflog их не вернёт — их не было в коммитах). Перед `--hard` спросите себя: «всё ли
  важное закоммичено?».
- ❌ **`reset` на опубликованных коммитах.** Если коммит уже запушен и его видели
  коллеги — `reset` перепишет историю и разъедётся с их локальными копиями. Для
  опубликованного используйте `revert` (модуль 10), для локального — `reset`.
- ❌ **Паника вместо `git reflog`.** «Я всё удалил» почти всегда лечится reflog — это
  первое, что нужно набрать, а не последнее.
- ❌ **Путать `--mixed` и `--soft`.** Если забыли, какой режим по умолчанию — это
  `--mixed`: индекс сбрасывается, working tree остаётся.

---

## Чек-лист модуля 8

- [ ] `git reflog` — мой **первый рефлекс** при «я потерял коммиты».
- [ ] Объясняю разницу **soft / mixed / hard** по тому, что происходит с index и
      working tree.
- [ ] Знаю, что `reset` двигает ветку и опасен для **опубликованных** коммитов —
      локальный откат делаю им, а не `revert`.
- [ ] Умею восстановить коммит по хешу из reflog: `git reset --hard <hash>` или
      `git reset --hard HEAD@{N}`.

---

## Шпаргалка команд модуля 8

```bash
# страховочная сетка
git reflog                       # журнал движений HEAD
git reset --hard HEAD@{1}        # вернуть HEAD на шаг назад по reflog
git reset --hard <hash>          # вернуться на конкретный «потерянный» коммит

# три режима reset (двигают ветку на <ref>)
git reset --soft  <ref>          # коммиты → обратно в index
git reset --mixed <ref>          # коммиты → в working tree, index сброшен (по умолчанию)
git reset --hard  <ref>          # стереть и index, и working tree (ОПАСНО)
```

---

## Домашнее задание

Живой пример выше уже показал: `reset`+`reflog` спасение и три режима reset. В ДЗ — те
же навыки, но другие сценарии. Работайте в своём `taskflow`, в **отдельных учебных
ветках** от `main` (`hw/...`) — `main` не трогаем, поэтому потеря коммитов затронет
только учебную ветку.

### Задание 1. Достать коммиты, «потерянные» после неудачного rebase

В живом примере мы теряли коммиты после `reset`. Теперь источник потери — **rebase**.

**Шаги:**
1. Создайте ветку `hw/rebase` от `main`, сделайте на ней 3 небольших коммита (например,
   три строки-заметки в новом файле `src/utils/notes.ts`).
2. Запустите `git rebase -i HEAD~3` и в редакторе **удалите одну строку** (drop
   одного коммита) — или схлопните два в один через `squash`. Завершите rebase.
3. Убедитесь, что один из исходных коммитов больше не виден в `git log`.
4. Через `git reflog` найдите хеш «потерянного» коммита и восстановите его содержимое
   (например, создайте новую ветку `git branch hw/rescued <hash>` на нём).

**Критерии «сделано»:**
- В `git reflog` виден шаг `rebase` и хеши коммитов до rebase.
- Ветка `hw/rescued` указывает на коммит, которого нет в `hw/rebase`.
- `git log hw/rescued` показывает восстановленный коммит.

**Подсказки:** строки reflog после rebase помечены `rebase (start)`/`rebase (finish)`.
Если запутались с интерактивным редактором — `GIT_SEQUENCE_EDITOR` позволяет
автоматизировать выбор, но для учёбы лучше пройти руками.

**Самопроверка:** `git log --oneline hw/rebase` (потерянного коммита нет) против
`git log --oneline hw/rescued` (он есть).

### Задание 2. `reset --soft` для переработки последних коммитов

В живом примере `--soft` использовался как демонстрация. Теперь — практическая задача:
объединить несколько «сырых» коммитов в один осмысленный **без rebase**.

**Шаги:**
1. На ветке `hw/squash` (от `main`) сделайте 3 отдельных коммита с мелкими правками
   одного файла (например, `src/utils/taskUtils.ts`): `wip`, `fix`, `wip again`.
2. Выполните `git reset --soft HEAD~3` — все три коммита «распакуются» в index.
3. Проверьте `git status -s` — все правки должны быть застейджены одним блоком.
4. Сделайте один коммит с человеческим сообщением, например
   `feat(utils): add task filtering by date`.

**Критерии «сделано»:**
- `git log --oneline hw/squash` показывает **один** новый коммит поверх `main` вместо
  трёх.
- Итоговый diff идентичен сумме трёх «сырых» коммитов (`git diff main hw/squash`).

**Подсказки:** `--soft` не трогает working tree, поэтому файлы физически не меняются —
меняется только то, что Git считает «уже закоммиченным».

**Самопроверка:** `git rev-list --count main..hw/squash` должно быть равно `1`.
