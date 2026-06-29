# Модуль 8. Восстановление и хирургия по истории

> **Цель модуля.** Перестать бояться Git: почти всё в нём восстановимо. К концу
> модуля вы своими словами объясняете, чем **revert** отличается от **reset**, чем
> различаются **soft / mixed / hard**, делаете `reflog` первым рефлексом при «потере»
> коммитов и умеете автоматически искать регрессию через **bisect**.

Этот документ — пошаговый разбор «живого примера» модуля 8 на проекте `taskflow`.
Все выводы команд ниже — **настоящие**. Чтобы не задеть `main`, всю «хирургию» делаем в
**отдельных учебных ветках** — все «поломки» происходят там, а `main` остаётся цел.
Единственное, что у вас будет отличаться, — это сами хеши (SHA-1), а в `reflog` будут и
более ранние записи из прошлых модулей (ориентируйтесь на верхние — это ваши свежие
действия).

> 💡 Чтобы команды Git не открывали редактор и не блокировали запись урока, в примерах
> использовались флаг `-m "..."` и переменная `GIT_EDITOR=true`. В реальной работе
> сообщения вы пишете в своём редакторе как обычно.

---

## Мысленная модель (прочитать до команд)

Четыре идеи, на которых держится весь модуль.

1. **reflog — это страховочная сетка.** Каждый раз, когда `HEAD` куда-то двигается
   (commit, checkout, reset, rebase, merge), Git дописывает строку в `reflog`. Это
   локальный журнал «где был HEAD». Даже если коммит больше не виден в `git log` (на
   него не указывает ни одна ветка), объект ещё лежит в `.git/objects` и достижим
   через `reflog` — обычно \~90 дней, пока не отработает `git gc`. Поэтому первый
   рефлекс при «я всё потерял» — не паника, а `git reflog`.

2. **reset двигает указатель ветки; revert создаёт новый коммит.**

   ```
   reset  → переписывает, КУДА смотрит ветка (история «переезжает» назад)
   revert → добавляет НОВЫЙ коммит, отменяющий изменения старого (история растёт вперёд)
   ```

   - **reset** меняет историю → опасен для **опубликованных** (запушенных) коммитов:
     у коллег история разъедется. Применяйте к локальным, ещё не отправленным коммитам.
   - **revert** ничего не переписывает, только добавляет «обратный» коммит → безопасен
     для уже опубликованного: это штатный способ откатить баг в общей ветке.

3. **Три режима reset = насколько глубоко откатываемся.** `reset <ref>` всегда двигает
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

4. **bisect = двоичный поиск по истории.** Вместо ручного перебора «когда же сломалось»
   вы помечаете один заведомо «хороший» и один «плохой» коммит, а Git делит диапазон
   пополам. С `git bisect run <команда>` Git сам прогоняет проверку на каждом шаге:
   за `log2(N)` шагов находит **первый плохой коммит**.

---

## Шаг 0. Готовим площадку

Всё делаем в своём `taskflow`. Чтобы экспериментировать без риска, каждую «поломку»
устраиваем в **отдельной учебной ветке** от `main` — её и будем ломать. `main` при этом
не трогается, поэтому даже `reset --hard` безопасен: он затронет только учебную ветку, а
исходные коммиты останутся достижимы через `reflog`.

> 💡 `reflog` — журнал перемещений `HEAD` по **всему** репозиторию, поэтому у вас в нём
> будут и записи из прошлых модулей. В примерах ниже показаны только свежие, верхние
> строки — на них и ориентируйтесь.

---

## Шаг 1. «Случайный» `reset --hard` и спасение через reflog

Заведём ветку с двумя коммитами — их и будем «терять».

```bash
git checkout -b feature/labels
echo 'export type Label = "bug" | "feature" | "chore"' > src/utils/labels.ts
git add src/utils/labels.ts && git commit -m "feat: add Label type"
echo 'export const ALL_LABELS: Label[] = ["bug","feature","chore"]' >> src/utils/labels.ts
git add src/utils/labels.ts && git commit -m "feat: add ALL_LABELS constant"
git log --oneline -4
```

**Вывод:**

```
b5d5c5d feat: add ALL_LABELS constant
6d03fc5 feat: add Label type
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Теперь «катастрофа»: думали откатить рабочие правки, а снесли два коммита.

```bash
git reset --hard HEAD~2
git log --oneline -3
```

**Вывод:**

```
HEAD is now at 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Коммитов `feat: add Label type` и `feat: add ALL_LABELS constant` в `git log` больше
нет. **Но они не исчезли.** Смотрим страховочную сетку:

```bash
git reflog
```

**Вывод:**

```
2381b21 HEAD@{0}: reset: moving to HEAD~2
b5d5c5d HEAD@{1}: commit: feat: add ALL_LABELS constant
6d03fc5 HEAD@{2}: commit: feat: add Label type
2381b21 HEAD@{3}: checkout: moving from main to feature/labels
2381b21 HEAD@{4}: clone: from /home/.../taskflow
```

**Объяснение построчно:**
- `HEAD@{0}` — последнее, что мы сделали: `reset` назад. Сюда `HEAD` указывает сейчас.
- `HEAD@{1}` = `b5d5c5d` — вот он, «потерянный» верхний коммит. Хеш цел.
- `HEAD@{2}`, `HEAD@{3}`, `HEAD@{4}` — вся предыдущая траектория `HEAD`: коммиты,
  checkout, сам clone. Это и есть журнал движений указателя.

Чтобы вернуться, делаем `reset --hard` уже **вперёд**, на сохранённый хеш:

```bash
git reset --hard b5d5c5d
git log --oneline -4
```

**Вывод:**

```
HEAD is now at b5d5c5d feat: add ALL_LABELS constant
b5d5c5d feat: add ALL_LABELS constant
6d03fc5 feat: add Label type
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Оба коммита и файл `src/utils/labels.ts` на месте. **Reflog — первый рефлекс при «потере».**

> 💡 Вместо хеша можно адресовать `git reset --hard HEAD@{1}` — синтаксис reflog
> понимает «где был HEAD один шаг назад».

---

## Шаг 2. soft / mixed / hard на одном примере

Теперь наглядно, чем режимы reset отличаются. Каждый раз откатываем один и тот же
верхний коммит и смотрим `git status -s` (`M ` слева = staged, ` M` справа = unstaged).

### 2.1. `--soft` — изменения остаются в index

```bash
git reset --soft HEAD~1
git status -s
git log --oneline -2
```

**Вывод:**

```
M  src/utils/labels.ts
6d03fc5 feat: add Label type
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
```

`M ` (символ в **первой** колонке) — файл **в индексе**, готов к коммиту. Коммит
«распаковался» обратно в staging. Удобно, когда хочется пересобрать последний коммит
другим сообщением или объединить с новыми правками.

### 2.2. `--mixed` (по умолчанию) — изменения в working tree, индекс сброшен

```bash
git reset --hard b5d5c5d   # вернули коммит обратно
git reset --mixed HEAD~1
git status -s
```

**Вывод:**

```
Unstaged changes after reset:
M	src/utils/labels.ts
 M src/utils/labels.ts
```

` M` (символ во **второй** колонке) — файл изменён в working tree, но **не** в индексе.
Это режим по умолчанию: после отката нужно снова сделать `git add`, чтобы вернуть в коммит.

### 2.3. `--hard` — изменения уничтожены

```bash
git reset --hard b5d5c5d   # вернули коммит обратно
git reset --hard HEAD~1
git status -s
git log --oneline -2
```

**Вывод:**

```
HEAD is now at 6d03fc5 feat: add Label type
6d03fc5 feat: add Label type
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
```

`git status -s` **пуст** — working tree чистый, изменения коммита `b5d5c5d` стёрты с
диска. Сам коммит ещё в reflog (его можно вернуть), а вот **незакоммиченные** правки
после `--hard` не вернёт никто. Поэтому `--hard` — самая опасная форма reset.

---

## Шаг 3. revert опубликованного бага и сравнение с reset

Представим, что в `main` уехал баг — и его уже видели коллеги. Переписывать историю
(`reset`) нельзя — откатываем штатно, через `revert`.

```bash
git checkout main
printf 'export const APP_VERSION = "1.0.0"\nexport const MAX_TASKS = -5  // BUG\n' > src/utils/config.ts
git add src/utils/config.ts && git commit -m "feat: add app config (MAX_TASKS)"
git log --oneline -2
```

**Вывод:**

```
fa30412 feat: add app config (MAX_TASKS)
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
```

Откатываем баг, **не трогая историю**:

```bash
git revert --no-edit HEAD
git log --oneline -3
```

**Вывод:**

```
[main 428affa] Revert "feat: add app config (MAX_TASKS)"
 1 file changed, 2 deletions(-)
428affa Revert "feat: add app config (MAX_TASKS)"
fa30412 feat: add app config (MAX_TASKS)
2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
```

**Объяснение:**
- Баговый коммит `fa30412` **остался** в истории — он опубликован, мы его не прячем.
- Сверху появился **новый** коммит `428affa`, который ровно отменяет его изменения
  (`config.ts` снова исчез). Историю можно безопасно пушить — у всех она сойдётся.
- `--no-edit` — взять стандартное сообщение `Revert "..."` без открытия редактора.

> ⚠️ **revert vs reset.** Если бы коммит был **локальным** и ещё не отправлен —
> можно было бы стереть его `git reset --hard HEAD~1` без следов. Но для
> **опубликованного** правильный инструмент — `revert`: он не ломает историю коллегам.

---

## Шаг 4. cherry-pick одного коммита в релизную ветку

Фича `feature/labels` ещё не готова, но один коммит из неё нужен прямо в релиз. Берём
точечно через `cherry-pick`.

```bash
git checkout -b release/1.0 main
git cherry-pick 6d03fc5        # только коммит "feat: add Label type"
git log --oneline -3
```

**Вывод:**

```
[release/1.0 85b5891] feat: add Label type
 1 file changed, 1 insertion(+)
85b5891 feat: add Label type
428affa Revert "feat: add app config (MAX_TASKS)"
fa30412 feat: add app config (MAX_TASKS)
```

**Объяснение:**
- Изменения коммита `6d03fc5` применились поверх `release/1.0` как **новый** коммит
  `85b5891`. Содержимое то же, но **хеш другой** — у него другой родитель (другое место
  в графе). cherry-pick копирует изменение, а не сам объект.
- Остальные коммиты `feature/labels` не приехали — взяли ровно один, что и требовалось.

> 💡 `cherry-pick` переносит коммит **внутри одного репозитория**. Если общей объектной
> базы нет (другой репозиторий, нет общего remote), тот же перенос делают через
> патч-файлы — `git format-patch` / `git am`, см. модуль 9.

---

## Шаг 5. stash при срочном переключении на хотфикс

Вы посреди правок, и тут «горит» хотфикс. Коммитить полуфабрикат не хочется — прячем
работу в `stash`.

```bash
git checkout main
printf '\n// TODO: группировка задач по дате\n' >> src/utils/taskUtils.ts
git status -s
```

**Вывод:**

```
 M src/utils/taskUtils.ts
```

Прячем и проверяем, что working tree чист:

```bash
git stash push -m "wip: группировка по дате"
git status -s
git stash list
```

**Вывод:**

```
Saved working directory and index state On main: wip: группировка по дате
stash@{0}: On main: wip: группировка по дате
```

`git status -s` теперь пуст — можно спокойно переключаться на ветку хотфикса, чинить,
коммитить. Сделали хотфикс, вернулись — достаём отложенное:

```bash
git stash pop
git status -s
```

**Вывод:**

```
On branch main
 M src/utils/taskUtils.ts
```

`pop` вернул правки в working tree и **удалил** запись из стэка. (Если хотите оставить
её в стэке — используйте `git stash apply`.)

---

## Шаг 6. restore одного файла из конкретного коммита

`git restore --source=<commit> <file>` достаёт версию **одного** файла из любого
коммита, **не трогая историю и остальные файлы**.

```bash
# случайно «сломали» файл в working tree
printf '\nconst BROKEN = true\n' >> src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
```

**Вывод:**

```
 M src/utils/taskUtils.ts
```

Возвращаем версию из `HEAD`:

```bash
git restore --source=HEAD src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
```

`git status -s` пуст — файл откатился к версии из указанного коммита. Источником может
быть любой ref: `--source=6061d7c`, `--source=main~3` и т. п. Это «точечная» операция
для одного файла, в отличие от `reset`, который двигает всю ветку.

---

## Шаг 7. bisect: ловим спрятанную регрессию автоматически

Ключевая сцена модуля. В `taskUtils.ts` за \~15 коммитов спрятан баг, который ломает
тест `sortTasks`. Искать вручную долго — отдадим поиск Git.

### 7.1. Подготовка зависимостей и серии коммитов

Чтобы `git bisect run npm test` мог прогонять тесты, один раз ставим зависимости:

```bash
npm ci
```

Дальше собираем ветку из 15 коммитов. Большинство — безобидные заметки, а **седьмой**
вносит регрессию в `sortTasks` (меняет знак сравнения по `done`, из-за чего выполненные
всплывают наверх):

```bash
git checkout -b dev/sprint main          # GOOD-база: 428affa
# 6 безобидных коммитов ...
# 7-й — РЕГРЕССИЯ в src/utils/taskUtils.ts:
#   было:  if (a.done !== b.done) return a.done ? 1 : -1
#   стало: if (a.done !== b.done) return a.done ? -1 : 1
git commit -m "refactor: tweak sortTasks ordering"   # 8da7b86 — здесь баг
# ещё 8 безобидных коммитов сверху ...
git rev-list --count main..HEAD
```

**Вывод:**

```
15
```

Проверяем, что на вершине ветки тест действительно красный:

```bash
npm test
```

**Вывод (фрагмент):**

```
 ❯ tests/taskUtils.test.ts (6 tests | 1 failed) 11ms
   × sortTasks > ставит невыполненные выше и сортирует по createdAt 7ms
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

### 7.2. Запуск двоичного поиска

```bash
git bisect start
git bisect bad  579aaea      # вершина — точно сломана
git bisect good 428affa      # база main — точно работала
```

**Вывод:**

```
status: waiting for both good and bad commits
status: waiting for good commit(s), bad commit known
Bisecting: 7 revisions left to test after this (roughly 3 steps)
[8da7b86...] refactor: tweak sortTasks ordering
```

Git уже сообщил: осталось \~3 шага на 15 коммитов (это и есть `log2`). Теперь —
самое мощное: пусть Git сам прогонит тесты на каждом шаге.

```bash
git bisect run npm test
```

**Вывод (сокращён — оставлены вердикты Git между прогонами):**

```
running 'npm' 'test'
   × sortTasks > ставит невыполненные выше и сортирует по createdAt
     → expected [ 'b', 'a', 'c' ] to deeply equal [ 'a', 'c', 'b' ]
 Test Files  1 failed (1)
Bisecting: 3 revisions left to test after this (roughly 2 steps)
[510b78a...] chore: sprint note 3
running 'npm' 'test'
 ✓ tests/taskUtils.test.ts (6 tests) 6ms
Bisecting: 1 revision left to test after this (roughly 1 step)
[4ced547...] chore: sprint note 5
running 'npm' 'test'
 ✓ tests/taskUtils.test.ts (6 tests) 4ms
Bisecting: 0 revisions left to test after this (roughly 0 steps)
[04ce5fd...] chore: sprint note 6
running 'npm' 'test'
 ✓ tests/taskUtils.test.ts (6 tests) 4ms

8da7b86beb48a4eab0d99e98685f562598eb16e4 is the first bad commit
commit 8da7b86beb48a4eab0d99e98685f562598eb16e4
Author: itbali <xopycaku@gmail.com>
    refactor: tweak sortTasks ordering
 src/utils/taskUtils.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
bisect found first bad commit
```

**Объяснение, что произошло:**
- Git использовал **код возврата** `npm test`: `0` = good, не-`0` = bad. Поэтому
  `git bisect run` работает с любым скриптом, возвращающим осмысленный exit code.
- На каждом шаге диапазон делился пополам: `7 → 3 → 1 → 0`. Всего \~4 прогона вместо
  перебора 15 коммитов вручную.
- Итог: `8da7b86 … is the first bad commit` — Git точно указал **тот самый** коммит
  с регрессией и показал его дифф (`taskUtils.ts | 2 +-`).

### 7.3. Завершение

```bash
git bisect reset
```

**Вывод:**

```
Previous HEAD position was 04ce5fd chore: sprint note 6
Switched to branch 'dev/sprint'
```

`git bisect reset` возвращает `HEAD` туда, где вы были до поиска. Дальше — чините
найденный коммит обычным образом (revert/fix-commit).

> 💡 Если какой-то коммит невозможно протестировать (не собирается по другой причине),
> в ручном bisect используйте `git bisect skip`, а в `run`-скрипте — код возврата
> `125`: Git поймёт, что этот коммит надо пропустить.

---

## Типичные ошибки модуля 8

- ❌ **`reset --hard` без понимания.** Стирает незакоммиченные правки безвозвратно
  (reflog их не вернёт — их не было в коммитах). Перед `--hard` спросите себя: «всё ли
  важное закоммичено?».
- ❌ **revert там, где нужен reset (и наоборот).** Для **локального** мусорного коммита —
  `reset`; для **опубликованного** бага — `revert`. Перепутать = либо мусор в истории,
  либо сломанная история у коллег.
- ❌ **Ручной поиск регрессии** перебором коммитов вместо `git bisect run`. На длинной
  истории это часы вместо `log2(N)` автоматических прогонов.
- ❌ **Паника вместо `git reflog`.** «Я всё удалил» почти всегда лечится reflog — это
  первое, что нужно набрать, а не последнее.
- ❌ **Забыть `git bisect reset`** после поиска — останетесь на «detached HEAD» в
  середине истории и запутаетесь.

---

## Чек-лист модуля 8

- [ ] `git reflog` — мой **первый рефлекс** при «я потерял коммиты».
- [ ] Различаю **revert** (новый коммит, безопасно для опубликованного) и **reset**
      (двигает ветку, для локального).
- [ ] Объясняю разницу **soft / mixed / hard** по тому, что происходит с index и
      working tree.
- [ ] Умею достать один файл из коммита через `git restore --source`.
- [ ] Прячу незаконченную работу `git stash` и возвращаю `pop`/`apply`.
- [ ] Умею найти регрессию через `git bisect start/good/bad` и `git bisect run`.

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

# откат без переписывания истории
git revert <commit>              # новый «обратный» коммит (для опубликованного)
git revert --no-edit <commit>    # то же, со стандартным сообщением
git revert -m 1 <merge-commit>   # откатить MERGE-коммит (см. ДЗ)

# перенос отдельного коммита
git cherry-pick <commit>         # скопировать изменение в текущую ветку

# отложить работу
git stash push -m "..."          # спрятать незакоммиченные правки
git stash list                   # список «заначек»
git stash pop                    # вернуть и удалить из стэка
git stash apply                  # вернуть, но оставить в стэке
git stash branch <name>          # вынести заначку в новую ветку (см. ДЗ)

# точечное восстановление файла
git restore --source=<commit> <file>

# двоичный поиск регрессии
git bisect start
git bisect bad  <ref>            # заведомо сломанный коммит
git bisect good <ref>            # заведомо рабочий коммит
git bisect run npm test          # автопоиск по коду возврата (0=good, 1..124=bad, 125=skip)
git bisect reset                 # выйти из режима bisect
```

---

## Домашнее задание

Живые примеры выше уже показали: `reset`+`reflog`, `revert` бага, `cherry-pick`,
`stash`/`pop`, `bisect` по сломанному `sortTasks`. В ДЗ — **те же навыки, но другие
сценарии**. Работайте в своём `taskflow`, в **отдельных учебных ветках** от `main`
(`hw/...`) — `main` не трогаем, поэтому потеря коммитов затронет только учебную ветку.

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

### Задание 2. Откатить MERGE-коммит через `git revert -m 1`

В живом примере мы реверти­ли **обычный** коммит. Merge-коммит реверти­тся иначе —
у него два родителя, и Git нужно подсказать, какую сторону считать «основной».

**Шаги:**
1. От `main` создайте ветку `hw/feature`, сделайте на ней 1–2 коммита (правка любого
   файла, например добавьте функцию-заглушку в `src/utils/taskUtils.ts`).
2. Вернитесь на `main` и слейте ветку **без fast-forward**: `git merge --no-ff hw/feature`.
   Убедитесь, что появился отдельный merge-коммит (`git log --graph --oneline`).
3. Решите, что фичу нужно откатить целиком. Выполните `git revert -m 1 <merge-commit>`.
4. Проверьте, что изменения фичи отменены, а история (включая merge) сохранена.

**Критерии «сделано»:**
- В истории есть merge-коммит с двумя родителями (`git show <merge> | head`).
- После `revert -m 1` файлы вернулись к состоянию до слияния.
- Добавлен новый revert-коммит; merge-коммит **не** исчез.

**Подсказки:** `-m 1` означает «оставить первого родителя (mainline) как базу и
отменить то, что принесла вторая сторона». Без `-m` Git откажется реверти­ть merge с
ошибкой `commit is a merge but no -m option was given`.

**Самопроверка:** `git diff <состояние-до-merge> HEAD -- <изменённый-файл>` должен
показать пустой дифф по содержимому фичи.

### Задание 3. `git stash branch` — вынести отложенную работу в новую ветку

В живом примере мы делали `stash pop` обратно в ту же ветку. Иногда отложенную работу
правильнее продолжить **в отдельной ветке** — для этого есть `git stash branch`.

**Шаги:**
1. На `main` начните правку (например, добавьте комментарий-заметку в
   `src/components/`), но **не** коммитьте.
2. Спрячьте её: `git stash push -m "wip: эксперимент"`.
3. Сделайте на `main` хотя бы один не связанный коммит (чтобы вершина сдвинулась).
4. Выполните `git stash branch hw/experiment` — Git создаст новую ветку от коммита, на
   котором делалась заначка, переключится на неё и применит изменения.
5. Закоммитьте отложенную работу уже в `hw/experiment`.

**Критерии «сделано»:**
- `git stash list` после `stash branch` пуст (заначка израсходована).
- Ветка `hw/experiment` содержит коммит с отложенной правкой.
- Правка **не** попала в `main`.

**Подсказки:** `stash branch` особенно полезен, когда `stash pop` даёт конфликт из-за
ушедшей вперёд ветки — новая ветка от исходного коммита применяет правки чисто.

**Самопроверка:** `git log --oneline --graph --all` — видно, что `hw/experiment`
ответвилась от точки, где делалась заначка, и несёт отложенный коммит.

### Задание 4. bisect ДРУГОГО бага (регрессия в `countRemaining`)

В живом примере bisect ловил баг в `sortTasks`. Теперь спрячьте регрессию в
**`countRemaining`** и найдите её своим тестом.

**Шаги:**
1. Допишите в `tests/taskUtils.test.ts` тест, жёстко фиксирующий поведение
   `countRemaining` (например, что для смешанного списка он возвращает число
   невыполненных, а **пустой** список даёт `0`). Закоммитьте тест — это «good».
2. Создайте ветку и серию из \~10 коммитов; в одном из средних внесите регрессию в
   `countRemaining` (например, поменяйте условие на противоположное — считать
   выполненные вместо невыполненных).
3. На вершине убедитесь, что `npm test` красный.
4. Запустите `git bisect start`, отметьте `good`/`bad` и выполните
   `git bisect run npm test`. Зафиксируйте, какой коммит назван первым плохим.
5. Завершите `git bisect reset` и почините баг (revert или fix-коммит).

**Критерии «сделано»:**
- Новый тест на `countRemaining` падает ровно на коммите с регрессией.
- `git bisect run npm test` выводит `<hash> is the first bad commit`, и это
  действительно ваш коммит с багом.
- После `git bisect reset` вы вернулись на вершину ветки.

**Подсказки:** тест должен быть «детерминированным» — падать только из-за вашей
регрессии, иначе bisect укажет не туда. Если коммит не собирается по другой причине,
помечайте его кодом возврата `125` (skip), а не `1` (bad).

**Самопроверка:** сравните хеш из вывода bisect с хешем коммита, в котором вы вносили
регрессию (`git log --oneline` своей ветки) — они должны совпасть.
