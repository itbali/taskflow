# Модуль 1. Ежедневный рабочий цикл

> **Цель модуля.** Освоить уверенный базовый цикл `status → diff → add → commit`
> и научиться делать **аккуратные, атомарные коммиты**. К концу модуля вы умеете
> разбивать одну правку файла на несколько осмысленных коммитов через `git add -p`,
> видите разницу `git diff` vs `git diff --staged` и правите последний коммит через
> `--amend`.

Этот документ — пошаговый разбор «живого примера» модуля 1 на проекте `taskflow`.
Все выводы команд ниже — **настоящие**, снятые в чистом клоне репозитория. Единственное,
что у вас будет отличаться, — это сами хеши (SHA-1) и даты: они зависят от содержимого,
вашего имени/почты и времени коммита. Структура и смысл вывода — те же.

В живом примере мы делаем фичу **«отметить задачу выполненной»** в `TaskItem.tsx`:
одно изменение файла содержит две независимые правки, и мы аккуратно раскладываем их
по **двум коммитам** через `git add -p`. В первом сообщении намеренно делаем опечатку
и чиним её через `--amend`.

---

## Мысленная модель (прочитать до команд)

В модуле 0 мы разобрали три дерева (working tree → index → HEAD). Модуль 1 — это
**жизненный цикл файла**, который ходит по этим деревьям:

```
untracked  ──git add──►  staged  ──git commit──►  committed  ──правим файл──►  modified
 (Git не                 (в индексе,              (в истории,                  (working tree
  знает файл)             ждёт коммита)            HEAD)                        разошёлся с HEAD)
```

Две идеи, которые делают коммиты аккуратными:

1. **Index — это «черновик следующего коммита», и он редактируется по кускам.**
   Вы не обязаны коммитить файл целиком. `git add -p` ставит в индекс **отдельные
   куски (hunks)** одного файла. Это ключевой навык модуля: из «грязной» рабочей
   директории собрать историю из атомарных коммитов.

2. **Хороший коммит — атомарный и самодостаточный.** Один коммит = одно логическое
   изменение, которое можно описать одной строкой и при необходимости откатить
   целиком, ничего не сломав. Сообщение: короткий заголовок в повелительном
   наклонении (`feat: ...`, `fix: ...`), при необходимости — тело с «зачем».

---

## Шаг 0. Стартовая точка

Перед началом рабочая директория чиста, история — это один коммит из модуля 0.

```bash
git status
git log --oneline --graph --decorate --all
```

**Вывод:**

```
On branch main

nothing to commit, working tree clean
```

```
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Объяснение:**

- `nothing to commit, working tree clean` — три дерева совпадают: working tree = index = HEAD.
  Это «нулевая» точка цикла, к которой мы вернёмся после каждого коммита.
- В графе пока линейная история из одного коммита; `HEAD -> main` — мы на ветке `main`.

---

## Шаг 1. Делаем фичу (одна правка файла = два разных изменения)

Открываем `src/components/TaskItem.tsx` и вносим **две независимые** правки:

1. на `<li>` на 11й строке добавляем атрибут доступности `aria-checked={task.done}` (и переносим
   на несколько строк);
2. внутри `<label>` на 12й строке добавляем бейдж «выполнено», который виден только у выполненных задач.

Файл после правок (фрагмент):

```tsx
export function TaskItem({ task, onToggle, onRemove }: Props) {
  return (
    <li
      className={`task-item ${task.done ? 'task-item--done' : ''}`}
      aria-checked={task.done}
    >
      <label className="task-item__label">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span className="task-item__title">{task.title}</span>
        {task.done && <span className="task-item__badge">выполнено</span>}
      </label>
```

Смотрим состояние:

```bash
git status
```

**Вывод:**

```
On branch main

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/components/TaskItem.tsx

no changes added to commit (use "git add" and/or "git commit -a")
```

**Объяснение:**

- Файл уже был в истории (tracked), поэтому он сразу попадает в раздел
  **`Changes not staged for commit`** со статусом `modified` — это состояние
  _modified_ из жизненного цикла. (Сравните с модулем 0, где новые файлы были
  _untracked_ в разделе `Untracked files`.)
- Git прямо подсказывает два пути: `git add` (поставить в индекс) и
  `git restore` (откатить правку в working tree).

---

## Шаг 2. Смотрим, что именно изменилось — `git diff`

```bash
git diff
```

**Вывод:**

```
diff --git a/src/components/TaskItem.tsx b/src/components/TaskItem.tsx
index b20f8e7..edef92e 100644
--- a/src/components/TaskItem.tsx
+++ b/src/components/TaskItem.tsx
@@ -8,7 +8,10 @@ type Props = {

 export function TaskItem({ task, onToggle, onRemove }: Props) {
   return (
-    <li className={`task-item ${task.done ? 'task-item--done' : ''}`}>
+    <li
+      className={`task-item ${task.done ? 'task-item--done' : ''}`}
+      aria-checked={task.done}
+    >
       <label className="task-item__label">
         <input
           type="checkbox"
@@ -16,6 +19,7 @@ export function TaskItem({ task, onToggle, onRemove }: Props) {
           onChange={() => onToggle(task.id)}
         />
         <span className="task-item__title">{task.title}</span>
+        {task.done && <span className="task-item__badge">выполнено</span>}
       </label>
       <button
         className="task-item__remove"
```

**Объяснение построчно:**

- `git diff` (без аргументов) показывает разницу **working tree ↔ index**, то есть
  «что я наизменял, но ещё НЕ поставил в индекс».
- `index b20f8e7..edef92e` — хеши blob'а до и после; `100644` — режим файла.
- `@@ -8,7 +8,10 @@` — заголовок **hunk'а**: «в старом файле с 8-й строки 7 строк,
  в новом с 8-й строки 10 строк». Здесь **два отдельных hunk'а** — это и есть наши
  две независимые правки. Именно их мы сейчас разложим по двум коммитам.
- Строки с `+` — добавленные, с `-` — удалённые, без префикса — контекст.

---

## Шаг 3. Раскладываем правки по кускам — `git add -p`

Вместо `git add <file>` (который поставит файл целиком) используем интерактивный режим:

```bash
git add -p src/components/TaskItem.tsx
```

Git показывает hunk'и по одному и спрашивает, что делать с каждым:

```
@@ -8,7 +8,10 @@ type Props = {

 export function TaskItem({ task, onToggle, onRemove }: Props) {
   return (
-    <li className={`task-item ${task.done ? 'task-item--done' : ''}`}>
+    <li
+      className={`task-item ${task.done ? 'task-item--done' : ''}`}
+      aria-checked={task.done}
+    >
...
(1/2) Stage this hunk [y,n,q,a,d,j,J,g,/,e,?]? y
```

```
@@ -16,6 +19,7 @@ export function TaskItem({ task, onToggle, onRemove }: Props) {
           onChange={() => onToggle(task.id)}
         />
         <span className="task-item__title">{task.title}</span>
+        {task.done && <span className="task-item__badge">выполнено</span>}
       </label>
...
(2/2) Stage this hunk [y,n,q,a,d,K,g,/,e,?]? n
```

Мы отвечаем **`y`** на первый hunk (`aria-checked`) и **`n`** на второй (бейдж).

**Что значат клавиши интерактива** (самые нужные):

| Клавиша   | Действие                                                             |
| --------- | -------------------------------------------------------------------- |
| `y`       | **yes** — поставить этот hunk в индекс.                              |
| `n`       | **no** — пропустить (оставить в working tree).                       |
| `s`       | **split** — разбить большой hunk на более мелкие (если Git может).   |
| `e`       | **edit** — вручную отредактировать hunk (тонкая нарезка по строкам). |
| `q`       | **quit** — выйти, больше ничего не спрашивать.                       |
| `a` / `d` | поставить **все** оставшиеся hunk'и в файле / пропустить все.        |
| `?`       | подсказка по всем клавишам.                                          |

> 💡 `s` (split) — спасение, когда две правки случайно попали в один hunk (рядом
> в файле). Git режет его на под-hunk'и, и вы по отдельности отвечаете `y`/`n`.

---

## Шаг 4. `git diff` vs `git diff --staged` — главное различие модуля

После `add -p` файл оказался **в обоих** деревьях по-разному: одна правка в индексе,
другая — нет. Это идеальный момент увидеть разницу двух diff'ов.

```bash
git status
```

```
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	modified:   src/components/TaskItem.tsx

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/components/TaskItem.tsx
```

Один и тот же файл числится **в обоих** разделах — часть его правок staged, часть нет.

```bash
git diff --staged
```

```
@@ -8,7 +8,10 @@ type Props = {
   return (
-    <li className={`task-item ${task.done ? 'task-item--done' : ''}`}>
+    <li
+      className={`task-item ${task.done ? 'task-item--done' : ''}`}
+      aria-checked={task.done}
+    >
```

```bash
git diff
```

```
@@ -19,6 +19,7 @@ export function TaskItem({ task, onToggle, onRemove }: Props) {
         <span className="task-item__title">{task.title}</span>
+        {task.done && <span className="task-item__badge">выполнено</span>}
       </label>
```

**Объяснение — запомните это раз и навсегда:**

- `git diff --staged` (синоним `--cached`) = **index ↔ HEAD**: «что уйдёт в следующий
  коммит». Здесь видна только правка `aria-checked` — мы её добавили через `y`.
- `git diff` (без флага) = **working tree ↔ index**: «что я ещё НЕ поставил в индекс».
  Здесь виден только бейдж `выполнено` — на него мы ответили `n`.
- Вместе они покрывают все изменения файла, но по разным «уровням». Это прямое
  следствие модели трёх деревьев.

---

## Шаг 5. Первый коммит (с намеренной опечаткой)

Коммитим то, что в индексе (только правку `aria-checked`):

```bash
git commit -m "feat: highlght done task with aria-checked"
```

**Вывод:**

```
[main 6a05362] feat: highlght done task with aria-checked
 1 file changed, 4 insertions(+), 1 deletion(-)
```

**Объяснение:**

- `[main 6a05362]` — коммит ушёл в ветку `main`, короткий хеш `6a05362` (у вас будет свой).
- `1 file changed, 4 insertions(+), 1 deletion(-)` — изменён один файл; статистика
  считается **только по тому, что было в индексе**. Бейдж в эту статистику не попал —
  он остался в working tree. Это и есть атомарность: коммит ровно про одну вещь.
- Заметили опечатку? `highlght` вместо `highlight`. Исправим на следующем шаге.

---

## Шаг 6. Чиним сообщение последнего коммита — `git commit --amend`

```bash
git commit --amend -m "feat: highlight done task with aria-checked"
```

**Вывод:**

```
[main baceabb] feat: highlight done task with aria-checked
 Date: Sat Jun 20 18:35:41 2026 +0100
 1 file changed, 4 insertions(+), 1 deletion(-)
```

**Объяснение:**

- `--amend` **переписывает последний коммит**: исправлено сообщение, опечатки больше нет.
- **Короткий хеш сменился** с `6a05362` на `baceabb`. Это критично: amend не «правит»
  старый коммит, а создаёт **новый** объект (содержимое коммита изменилось → хеш другой).
  Старый `6a05362` остаётся «осиротевшим» (доступен через `git reflog`, но не в ветке).
- `--amend` без `-m` открыл бы редактор с текущим сообщением. С `-m` — задаём новое сразу.

> ⚠️ Правило безопасности: `--amend` меняет историю. Безопасно для коммитов, которые
> вы **ещё не запушили**. Переписывать уже опубликованные коммиты — отдельная тема
> (force-push), её разберём позже. Здесь коммит локальный — амендить можно спокойно.

---

## Шаг 7. Второй коммит (оставшийся кусок)

Теперь ставим в индекс остаток (бейдж) и коммитим его отдельно:

```bash
git add src/components/TaskItem.tsx
git commit -m 'feat: show "выполнено" badge for done tasks'
```

**Вывод:**

```
[main 166bed4] feat: show "выполнено" badge for done tasks
 1 file changed, 1 insertion(+)
```

**Объяснение:** из одной правки одного файла получилось **два атомарных коммита** —
«доступность» и «бейдж» разделены. Каждый можно отдельно прочитать, отдельно
отревьюить, отдельно откатить. Это и есть навык модуля.

---

## Шаг 8. Смотрим граф и читаем коммит — `git log` / `git show`

```bash
git log --oneline --graph --decorate --all
```

**Вывод:**

```
* 166bed4 (HEAD -> main) feat: show "выполнено" badge for done tasks
* baceabb feat: highlight done task with aria-checked
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Объяснение:**

- Два наших коммита легли поверх истории. Опечаточного `6a05362` в графе **нет** —
  его «заменил» `baceabb` после amend.

Читаем конкретный коммит целиком:

```bash
git show baceabb
```

**Вывод:**

```
commit baceabbcf1ebb00e60516133a06a47bb71ca5010
Author: itbali <xopycaku@gmail.com>
Date:   Sat Jun 20 18:35:41 2026 +0100

    feat: highlight done task with aria-checked

diff --git a/src/components/TaskItem.tsx b/src/components/TaskItem.tsx
index b20f8e7..dc8a2bb 100644
--- a/src/components/TaskItem.tsx
+++ b/src/components/TaskItem.tsx
@@ -8,7 +8,10 @@ type Props = {

 export function TaskItem({ task, onToggle, onRemove }: Props) {
   return (
-    <li className={`task-item ${task.done ? 'task-item--done' : ''}`}>
+    <li
+      className={`task-item ${task.done ? 'task-item--done' : ''}`}
+      aria-checked={task.done}
+    >
       <label className="task-item__label">
```

**Объяснение:** `git show <commit>` = метаданные коммита (автор, дата, сообщение)
**плюс** его diff относительно родителя. Без аргумента (`git show`) показывает HEAD.
Полезно, чтобы проверить «а что вообще вошло в этот коммит» перед пушем.

---

## Шаг 9. Откатить лишнюю правку — `git restore`

Допустим, мы случайно дописали в файл строку-мусор и хотим её выбросить
(не коммитить и не оставлять в working tree):

```bash
git status --short          # ' M' = modified, не в индексе
git restore src/components/TaskItem.tsx
git status --short          # пусто — чисто
```

**Вывод:**

```
 M src/components/TaskItem.tsx
```

```
(после restore — пусто)
```

**Объяснение:**

- `git restore <file>` возвращает файл в working tree к версии **из индекса** (а так
  как индекс совпадает с HEAD, — к последнему коммиту). Незакоммиченная правка теряется
  **безвозвратно** — это не undo-в-историю, а буквально перезапись файла. Будьте аккуратны.
- Родственные формы: `git restore --staged <file>` — убрать файл из индекса (unstage),
  оставив правку в working tree; `git restore --source=HEAD~1 <file>` — взять файл из
  конкретного коммита. В статусе Git сам подсказывает нужный вариант.

---

## Типичные ошибки модуля 1

- ❌ **«Коммит-помойка»** — один коммит на 30 несвязанных изменений. Прочитать diff
  невозможно, откатить точечно — тоже. Лечится `git add -p` и атомарными коммитами.
- ❌ **`git add .` не глядя** — заметает в индекс случайные правки, отладочный код,
  чужие файлы. Сначала `git status` и `git diff`, потом осознанный `add` (лучше `-p`).
  (Артефакты и зависимости — отдельная тема гигиены, модуль 2.)
- ❌ Путать **`git diff`** (working tree ↔ index) и **`git diff --staged`**
  (index ↔ HEAD) → сюрприз «закоммитилось не то».
- ❌ `--amend` по уже **запушенному** коммиту без понимания последствий → расхождение
  с удалёнными и боль для команды.
- ❌ `git restore <file>`, забыв, что незакоммиченные правки **исчезнут навсегда**.

---

## Чек-лист модуля 1

- [ ] Делю изменения на **атомарные коммиты** (один коммит = одно логическое изменение).
- [ ] Пишу **внятные сообщения**: короткий заголовок в повелительном наклонении.
- [ ] Уверенно пользуюсь **`git add -p`** (`y`/`n`/`s`/`e`) и понимаю, что такое hunk.
- [ ] Знаю разницу **`git diff`** vs **`git diff --staged`** и могу объяснить через три дерева.
- [ ] Умею поправить последний коммит через **`--amend`** и понимаю, что хеш сменится.
- [ ] Умею откатить правку через **`git restore`** (и `--staged` для unstage).

---

## Шпаргалка команд модуля 1

```bash
# смотрим состояние
git status                    # три дерева: что modified / staged
git status --short            # компактно: XY <file>
git diff                      # working tree ↔ index (НЕ в индексе)
git diff --staged             # index ↔ HEAD (уйдёт в коммит)

# ставим в индекс
git add <file>                # файл целиком
git add -p <file>             # по кускам (hunks): y/n/s/e/q/a/d/?
git restore --staged <file>   # убрать из индекса (unstage), правка остаётся

# коммитим
git commit -m "..."           # index → новый коммит
git commit                    # то же, но сообщение в редакторе
git commit --amend -m "..."   # переписать последний коммит (меняет хеш!)

# читаем историю
git log --oneline --graph --decorate --all
git show <commit>             # метаданные + diff коммита

# откат правок в working tree
git restore <file>            # вернуть файл к версии из индекса/HEAD (правка теряется!)
```

---

## Домашнее задание

Тренируем **те же навыки** (status/diff, `add -p`, атомарные коммиты, `restore`,
`--amend`), но на **другой фиче и других файлах** — добавляем задачам
**приоритет** (`priority`). Делать в любом клоне `taskflow` (можно в своём рабочем
репозитории — коммиты локальные).

### Что нужно сделать

Внести в рабочую директорию **сразу несколько несвязанных правок** (получится
«грязный» рабочий стол), а затем аккуратно собрать из них **3 атомарных коммита**
и выбросить лишнее.

1. В `src/state/tasksStore.ts`:
   - расширьте тип `Task` полем `priority: 'low' | 'normal' | 'high'`;
   - проставьте `priority` в трёх элементах `initialTasks` (например `'high'`,
     `'normal'`, `'low'`);
   - в `addTask` создавайте новую задачу с `priority: 'normal'` по умолчанию;
   - добавьте новый колбэк `setPriority(id, priority)` (по аналогии с `toggleTask`)
     и верните его из хука.
2. В `src/components/TaskItem.tsx`:
   - покажите приоритет задачи (например `<span className="task-item__priority">{task.priority}</span>`).
3. **Лишняя правка «для тренировки restore»:** где-нибудь добавьте мусорную строку —
   например `console.log('debug', task)` в `TaskItem.tsx` или закомментированный код.
   Эту правку нужно будет выбросить, а не закоммитить.

### Как разложить на 3 коммита

Соберите ровно такую историю (поверх вашего стартового коммита):

1. `feat: add priority field to Task model` — только тип `Task` + дефолт в `addTask`
   - значения в `initialTasks` (изменения в `tasksStore.ts`, относящиеся к модели).
2. `feat: add setPriority action to tasks store` — только новый колбэк `setPriority`
   и его возврат из хука.
3. `feat: render task priority in TaskItem` — только отображение приоритета в `TaskItem.tsx`.

А мусорную `console.log`-правку **выбросьте через `git restore`** до коммитов
(или оставьте её в working tree и не добавляйте — но по ДЗ нужно именно `restore`).

После трёх коммитов: в сообщении **последнего** коммита намеренно сделайте опечатку,
заметьте её в `git log` и **исправьте через `git commit --amend`**.

(Проставить релизный тег на эту историю — задание модуля 4.)

### Критерии «сделано»

- [ ] `git log --oneline` показывает **ровно 3 ваших новых коммита** с осмысленными
      сообщениями (плюс исходная история).
- [ ] Коммиты **атомарные**: `git show <commit>` для каждого содержит изменения
      только «своей» темы (модель / экшен / отображение).
- [ ] Мусорной строки (`console.log` и т.п.) **нет ни в одном коммите** и нет в
      рабочей директории (`git status` чист после `restore`).
- [ ] В истории **нет** коммита с опечаткой — он переписан через `--amend`
      (его старый короткий хеш виден только в `git reflog`).
- [ ] `git status` в конце — `working tree clean`.

### Подсказки

- Тип `Task` и `addTask` — это разные логические изменения, но лежат в **одном файле**
  (`tasksStore.ts`). Делите их через `git add -p`: отвечайте `y` на нужные hunk'и и
  `n` на остальные. Если две правки попали в один hunk — нажмите `s` (split) или `e` (edit).
- Перед каждым коммитом сверяйтесь: `git diff --staged` показывает «что уйдёт в коммит»,
  `git diff` — «что осталось не добавленным». В коммит должна попасть только одна тема.
- Лишнюю правку убирайте **до** `add`: `git restore <file>` — если правка ещё не в индексе.
  Если успели её застейджить — сначала `git restore --staged <file>`, потом `git restore <file>`.
- `--amend` правит **последний** коммит. Если опечатка в более раннем — сначала сделайте
  его последним (это уже тема rebase, для ДЗ держите опечатку в третьем коммите).

### Как проверить себя

```bash
git log --oneline --graph --decorate           # 3 атомарных коммита, без опечатки
git show HEAD~2 --stat                          # 1-й коммит: только tasksStore.ts (модель)
git show HEAD~1 --stat                          # 2-й коммит: только setPriority
git show HEAD     --stat                        # 3-й коммит: только TaskItem.tsx
git grep "console.log" -- src/                  # пусто = мусор не закоммичен
git status                                      # working tree clean
git reflog | head                               # тут виден «осиротевший» коммит с опечаткой
```

Если все пункты критериев выполнены — навык ежедневного рабочего цикла закреплён.
