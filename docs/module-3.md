# Модуль 3. Ветки и слияния

> **Цель модуля.** Свободно *ветвиться* и *осознанно* сливать. К концу модуля вы
> читаете граф истории в `git log --graph`, понимаете разницу между **fast-forward**
> и **3-way merge**, знаете, зачем у merge-коммита **два родителя**, и спокойно
> разрешаете конфликт слияния, а не паникуете при виде маркеров `<<<<<<<`.

Этот документ — пошаговый разбор «живого примера» модуля 3 на проекте `taskflow`.
Все выводы команд ниже — **настоящие**, снятые в реальном клоне репозитория. Конфликт
слияния в `src/utils/taskUtils.ts` тоже срежиссирован и разрешён по-настоящему —
вы увидите подлинные маркеры конфликта и реальный вывод `git merge` / `git status`.
Единственное, что у вас будет отличаться, — это сами хеши (SHA-1): они зависят от
содержимого, вашего имени/почты и времени коммита. Структура и смысл вывода — те же.

---

## Мысленная модель (прочитать до команд)

Четыре идеи, на которых держится вся работа с ветками:

1. **Ветка — это просто подвижный указатель на коммит.** Файл `refs/heads/main` —
   это одна строка с хешем коммита. Создать ветку = создать ещё один такой файл.
   Поэтому ветвление в Git мгновенное и почти бесплатное: копировать снимки проекта
   не нужно, достаточно записать 40 символов.

2. **HEAD указывает на ветку, ветка — на коммит.** Когда вы коммитите, двигается
   *та ветка, на которую смотрит HEAD*. Когда переключаетесь (`git switch`), HEAD
   начинает указывать на другую ветку, а working tree обновляется под её коммит.

3. **Два способа слить ветку:**

   ```
   fast-forward (FF)              3-way merge (--no-ff / расхождение)
   main не двигался               main и feature разошлись
   просто двигаем указатель       создаётся merge-коммит с ДВУМЯ родителями

   A───B───C (main, feature)      A───B───C (main)
                                       \       \
                                        D───E───M  ← merge-коммит
   ```

   - **fast-forward** — `main` не получил новых коммитов с момента ответвления,
     поэтому Git просто «перематывает» указатель `main` вперёд на коммит ветки.
     Нового коммита не создаётся, граф остаётся линейным.
   - **3-way merge** — обе ветки получили коммиты после точки расхождения. Git берёт
     **три** снимка (общий предок + два конца) и создаёт новый **merge-коммит**.

4. **У merge-коммита два родителя.** Обычный коммит ссылается на одного родителя,
   merge-коммит — на двух (по одному на каждую слитую ветку). Именно эти две ссылки
   `parent` рисуют «ромб» в `git log --graph`. `--no-ff` заставляет создать
   merge-коммит даже там, где возможен fast-forward, — чтобы в истории осталась
   видимая отметка «здесь была ветка фичи».

---

## Шаг 0. Откуда стартуем

В начале модуля у нас линейная история из трёх коммитов на ветке `main`
(результат модулей 0–2):

```bash
git log --oneline --graph --decorate --all
```

**Вывод:**

```
* 2381b21 (HEAD -> main) docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Одна линия, никаких ветвлений — `*` идут друг под другом. Наша задача в этом
модуле — научиться эту линию ветвить и снова сводить.

---

## Шаг 1. Создаём ветку: `git switch -c`

Современный способ создать ветку и сразу на неё перейти — `git switch -c`
(`-c` = create). Это замена старому `git checkout -b`: делает то же самое, но
команда `switch` занимается *только переключением веток* и потому безопаснее и
понятнее, чем перегруженный `checkout`.

```bash
git switch -c feature/filters
git branch -vv
```

**Вывод:**

```
Switched to a new branch 'feature/filters'
* feature/filters 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
  main            2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
```

**Объяснение построчно:**
- `Switched to a new branch 'feature/filters'` — ветка создана, и HEAD теперь
  указывает на неё (звёздочка `*` в `git branch -vv`).
- Обе ветки, `feature/filters` и `main`, пока показывают **один и тот же** коммит
  `2381b21` — ветка только что ответвилась и ещё ничего не добавила. Это наглядно
  подтверждает: «создать ветку» = «поставить ещё один указатель на тот же коммит».

---

## Шаг 2. Коммит в ветке и fast-forward merge

Добавим в ветке `feature/filters` маленькую фичу — текстовый поиск по задачам — в
файл `src/utils/taskUtils.ts`:

```ts
/** Текстовый поиск по заголовку задачи (без учёта регистра). */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter((t) => t.title.toLowerCase().includes(q))
}
```

```bash
git add src/utils/taskUtils.ts
git commit -m "feat(filters): add case-insensitive title search"
```

**Вывод:**

```
[feature/filters b786332] feat(filters): add case-insensitive title search
 1 file changed, 7 insertions(+)
```

Теперь граф разошёлся на один коммит: `feature/filters` ушла вперёд, `main` стоит
на месте.

```bash
git log --oneline --graph --decorate --all
```

```
* b786332 (HEAD -> feature/filters) feat(filters): add case-insensitive title search
* 2381b21 (main) docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Возвращаемся на `main` и сливаем. **Ключевой момент:** `main` *не получал* новых
коммитов после ответвления, поэтому слияние будет **fast-forward**.

```bash
git switch main
git merge feature/filters
```

**Вывод:**

```
Switched to branch 'main'
=== fast-forward merge ===
Updating 2381b21..b786332
Fast-forward
 src/utils/taskUtils.ts | 7 +++++++
 1 file changed, 7 insertions(+)
```

**Объяснение:**
- `Updating 2381b21..b786332` — Git перематывает `main` с коммита `2381b21` на
  `b786332`.
- `Fast-forward` — **нового коммита не создано**. Указатель `main` просто
  «доехал» до коммита ветки. История осталась линейной:

```bash
git log --oneline --graph --decorate
```

```
* b786332 (HEAD -> main, feature/filters) feat(filters): add case-insensitive title search
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Обе ветки снова на одном коммите `b786332`. Ромба нет — это и есть fast-forward.

---

## Шаг 3. Удаляем слитую ветку: `git branch -d`

Ветку, которая уже влита в `main`, можно безопасно удалить — её работа никуда не
денется, она «вшита» в историю `main`.

```bash
git branch -d feature/filters
```

**Вывод:**

```
Deleted branch feature/filters (was b786332).
```

`-d` (delete) удаляет **только полностью слитую** ветку. Если бы в ветке остались
не слитые коммиты, Git отказал бы и предупредил о потере работы — для принудительного
удаления есть `-D` (см. шаг 7). Удаляется только указатель; сами коммиты остаются
в истории `main`.

---

## Шаг 4. `--no-ff`: принудительный merge-коммит

Иногда линейная история нежелательна: хочется, чтобы в графе осталась видимая
«арка» — отметка о том, что здесь жила и влилась отдельная фича. Для этого есть
`--no-ff` (no fast-forward): он создаёт merge-коммит **даже когда возможен FF**.

Создаём ветку `feature/counter`, добавляем счётчик выполненных задач в
`src/utils/taskUtils.ts`:

```ts
/** Счётчик выполненных задач. */
export function countDone(tasks: Task[]): number {
  return tasks.reduce((acc, t) => (t.done ? acc + 1 : acc), 0)
}
```

```bash
git switch -c feature/counter
# ... правим файл ...
git add src/utils/taskUtils.ts
git commit -m "feat(counter): add countDone helper"
```

```
[feature/counter c04d348] feat(counter): add countDone helper
 1 file changed, 5 insertions(+)
```

Сливаем с `--no-ff`. Поскольку `switch` запускает редактор для сообщения merge-коммита,
сообщение задаём флагом `-m` (иначе Git откроет ваш `core.editor`):

```bash
git switch main
git merge --no-ff -m "merge: feature/counter (countDone helper)" feature/counter
```

**Вывод:**

```
Switched to branch 'main'
Merge made by the 'ort' strategy.
 src/utils/taskUtils.ts | 5 +++++
 1 file changed, 5 insertions(+)
```

**Объяснение:**
- `Merge made by the 'ort' strategy` — здесь, в отличие от шага 2, **создан
  настоящий merge-коммит**. `ort` — название стандартного алгоритма слияния в
  современном Git.
- В прошлый раз был `Fast-forward` — потому что мы *не* просили `--no-ff`. Сравните
  два вывода: это и есть разница между «перемоткой указателя» и «новым коммитом».

Смотрим граф — появился ромб:

```bash
git log --oneline --graph --decorate
```

```
*   722fd9b (HEAD -> main) merge: feature/counter (countDone helper)
|\
| * c04d348 (feature/counter) feat(counter): add countDone helper
|/
* b786332 feat(filters): add case-insensitive title search
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Как читать граф:**
- `*   722fd9b ... merge:` — merge-коммит. Две ведущие вниз линии `|\` означают
  «у этого коммита два родителя».
- `| * c04d348` — коммит из влитой ветки.
- `|/` — линии сходятся обратно: ветка влита и закрыта.

Докажем, что у merge-коммита **два родителя**:

```bash
git cat-file -p HEAD | head -5
```

```
tree 09236badab0832c538af229bde99f624d6fd0958
parent b786332451dc2a12433e477d7b65f33b0fb0d4b4
parent c04d3487180519e1507c7fad8596c8e8f49585cd
author itbali <xopycaku@gmail.com> 1781976975 +0100
committer itbali <xopycaku@gmail.com> 1781976975 +0100
```

**Две строки `parent`** — вот вся «магия» merge-коммита. Первый родитель — состояние
`main` до слияния, второй — конец влитой ветки. У обычного коммита строка `parent`
одна (а у root-commit, как мы видели в модуле 0, её нет вовсе).

Чистим ветку: `git branch -d feature/counter` → `Deleted branch feature/counter (was c04d348).`

---

## Шаг 5. Режиссируем КОНФЛИКТ: две ветки правят один блок

Конфликт возникает, когда **обе** ветки изменили **один и тот же участок** одного
файла, и Git не может решить, чьё изменение взять. Срежиссируем это намеренно на
функции `sortTasks` в «горячем» файле `src/utils/taskUtils.ts`.

**Ветка `feature/filters`** меняет сортировку на «по заголовку A→Z»:

```bash
git switch -c feature/filters
```

```ts
/** Сортировка: незавершённые сверху, затем по заголовку (A→Z). */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.title.localeCompare(b.title)
  })
}
```

```bash
git add src/utils/taskUtils.ts
git commit -m "feat(filters): sort by title within status groups"
```

```
[feature/filters f2f7ecf] feat(filters): sort by title within status groups
 1 file changed, 2 insertions(+), 2 deletions(-)
```

**Параллельно в `main`** делаем *другой* фикс того же блока — «новые задачи выше»:

```bash
git switch main
```

```ts
/** Сортировка: незавершённые сверху, затем новые задачи выше. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.createdAt - a.createdAt
  })
}
```

```bash
git add src/utils/taskUtils.ts
git commit -m "fix(sort): newest tasks first within groups"
```

```
[main bad54d1] fix(sort): newest tasks first within groups
 1 file changed, 2 insertions(+), 2 deletions(-)
```

Теперь ветки **разошлись** — обе тронули `sortTasks`:

```bash
git log --oneline --graph --decorate --all
```

```
* bad54d1 (HEAD -> main) fix(sort): newest tasks first within groups
| * f2f7ecf (feature/filters) feat(filters): sort by title within status groups
|/
*   722fd9b merge: feature/counter (countDone helper)
|\
| * c04d348 feat(counter): add countDone helper
|/
* b786332 feat(filters): add case-insensitive title search
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Видно расхождение: `main` (`bad54d1`) и `feature/filters` (`f2f7ecf`) растут из
общего предка `722fd9b` в разные стороны. Пытаемся слить:

```bash
git merge feature/filters
```

**Вывод (команда завершилась с ошибкой — это нормально!):**

```
Auto-merging src/utils/taskUtils.ts
CONFLICT (content): Merge conflict in src/utils/taskUtils.ts
Automatic merge failed; fix conflicts and then commit the result.
```

**Объяснение:**
- `Auto-merging ...` — Git пытался слить файл автоматически.
- `CONFLICT (content): Merge conflict in ...` — не смог: обе ветки переписали один и
  тот же блок. Это **не поломка**, а штатная остановка с просьбой принять решение.
- `Automatic merge failed; fix conflicts and then commit the result.` — прямая
  инструкция: разреши конфликты и заверши слияние коммитом.

---

## Шаг 6. Читаем `git status` во время конфликта

Первое, что нужно сделать при конфликте, — **не паниковать** и спросить статус:

```bash
git status
```

**Вывод:**

```
On branch main

You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   src/utils/taskUtils.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

**Объяснение построчно:**
- `You have unmerged paths` — вы находитесь *в середине* слияния.
- `(use "git merge --abort" to abort the merge)` — **аварийный выход**: если что-то
  пошло не так, эта команда вернёт всё к состоянию до `git merge`. Запомните её —
  она снимает страх «я всё сломал».
- `Unmerged paths: both modified: src/utils/taskUtils.ts` — файлы с конфликтом.
  `both modified` = «изменён в обеих ветках». Именно их нужно разрешить.

---

## Шаг 7. Читаем маркеры конфликта

Откроем `src/utils/taskUtils.ts` — Git вписал в место конфликта три маркера:

```ts
<<<<<<< HEAD
/** Сортировка: незавершённые сверху, затем новые задачи выше. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.createdAt - a.createdAt
=======
/** Сортировка: незавершённые сверху, затем по заголовку (A→Z). */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.title.localeCompare(b.title)
>>>>>>> feature/filters
  })
}
```

**Как читать три маркера:**
- `<<<<<<< HEAD` — начало «нашей» версии (текущая ветка, `main`). Всё до `=======` —
  то, что есть в `HEAD`.
- `=======` — разделитель между двумя версиями.
- `>>>>>>> feature/filters` — конец «их» версии (та ветка, которую вливаем). Всё
  между `=======` и `>>>>>>>` пришло из `feature/filters`.

> 💡 Обратите внимание: строки `})` и `}` **вне** маркеров — они одинаковы в обеих
> версиях, Git их не тронул. Конфликтует только реально разошедшийся блок.

---

## Шаг 8. Разрешаем конфликт вручную

Разрешить конфликт = оставить в файле **корректный финальный код** и **удалить все
три маркера**. Здесь обе стратегии полезны, поэтому объединим их: сортируем по
заголовку, а при равных заголовках — новые выше. Заменяем весь блок с маркерами на:

```ts
/** Сортировка: незавершённые сверху, затем по заголовку (A→Z),
 *  при равных заголовках — новые задачи выше. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const byTitle = a.title.localeCompare(b.title)
    if (byTitle !== 0) return byTitle
    return b.createdAt - a.createdAt
  })
}
```

> ⚠️ Главное правило: **не удаляйте чужой код наугад, просто убрав маркеры.**
> Маркеры — это технические скобки. Ваша задача — *понять обе версии* и собрать
> осмысленный результат, а не «лишь бы компилировалось».

Сохранили файл — но Git об этом ещё не знает. Проверим статус:

```bash
git status
```

```
On branch main
...
Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   src/utils/taskUtils.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

Файл всё ещё в `Unmerged paths` — редактирование само по себе не помечает конфликт
разрешённым. Это нужно сделать явно через `git add`.

---

## Шаг 9. Завершаем слияние: `git add` + `git commit`

```bash
git add src/utils/taskUtils.ts
git status
```

**Вывод:**

```
On branch main
...
All conflicts fixed but you are still merging.
  (use "git commit" to conclude merge)

Changes to be committed:
	modified:   src/utils/taskUtils.ts
```

**Объяснение:**
- `All conflicts fixed but you are still merging` — Git признал конфликт
  разрешённым (именно `git add` это сделал!), но слияние ещё не завершено.
- `(use "git commit" to conclude merge)` — последний шаг: закоммитить.

Завершаем. Git уже подготовил черновик сообщения merge-коммита; достаточно `git commit`
(здесь задаём сообщение явно через `-m`):

```bash
git commit -m "merge: feature/filters into main; combine title + recency sort"
```

```
[main bb846af] merge: feature/filters into main; combine title + recency sort
```

Смотрим итоговый граф:

```bash
git log --oneline --graph --decorate
```

```
*   bb846af (HEAD -> main) merge: feature/filters into main; combine title + recency sort
|\
| * f2f7ecf (feature/filters) feat(filters): sort by title within status groups
* | bad54d1 fix(sort): newest tasks first within groups
|/
*   722fd9b merge: feature/counter (countDone helper)
|\
| * c04d348 feat(counter): add countDone helper
|/
* b786332 feat(filters): add case-insensitive title search
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

Обратите внимание на разошедшиеся линии перед `bb846af`: `* |` (коммит `main`) и
`| *` (коммит `feature/filters`) идут параллельно, а merge-коммит `bb846af` снова
их сводит. Это и есть результат разрешённого конфликта: **3-way merge** двух
действительно разошедшихся веток.

Чистим: `git branch -d feature/filters` → `Deleted branch feature/filters (was f2f7ecf).`

> 🔧 **Альтернатива ручному разрешению — `git mergetool`.** Команда открывает
> внешний визуальный 3-way merge (VS Code, Meld, vimdiff и т.п.), где «наша»,
> «их» и «общая» версии показаны бок о бок. После сохранения `mergetool` сам
> ставит файл в индекс — остаётся только `git commit`. Настраивается через
> `git config --global merge.tool <name>`. Логика та же, что в шагах 7–9, просто
> маркеры вы правите не в тексте, а в трёх панелях.

---

## Бонус: переименование ветки `git branch -m`

Ветку можно переименовать в любой момент — это безопасно, ведь ветка лишь указатель:

```bash
git switch -c feat/wip
git branch -m feat/wip feature/labels   # старое-имя новое-имя
git branch
```

```
* feature/labels
  main
```

`-m` = move/rename (тот же флаг, что для переименования `main` в модуле 0). Если
переименовываете **текущую** ветку, имя «до» можно опустить: `git branch -m новое-имя`.
А `-D` (заглавная) удаляет ветку принудительно, даже если она **не** слита:

```bash
git branch -D feature/labels
```

```
Deleted branch feature/labels (was bb846af).
```

> ⚠️ `-D` не спрашивает подтверждения и может потерять не слитые коммиты. Используйте
> `-d` по умолчанию и переходите на `-D`, только когда точно знаете, что делаете.

---

## Типичные ошибки модуля 3

- ❌ **Паника при конфликте.** `CONFLICT` — не поломка, а штатная остановка. Всегда
  есть аварийный выход: `git merge --abort` вернёт всё как было.
- ❌ **«Разрешение» наугад** — просто стереть маркеры или чужую половину, не вникая.
  Так теряется чья-то работа. Нужно *понять обе версии* и собрать корректный код.
- ❌ **Забыть `git add` после разрешения.** Пока файл в `Unmerged paths`, слияние
  не завершить. Именно `git add` помечает конфликт решённым.
- ❌ **Думать, что `merge` всегда создаёт merge-коммит.** При fast-forward коммита
  нет — указатель просто перематывается. Нужен видимый merge — берите `--no-ff`.
- ❌ **Путать `-d` и `-D`.** Маленькая `-d` бережёт от потери не слитых коммитов,
  большая `-D` удаляет силой.

---

## Чек-лист модуля 3

- [ ] Объясняю, что **ветка — это указатель на коммит**, и почему ветвление дешёвое.
- [ ] Читаю граф `git log --oneline --graph --decorate --all`: вижу ветвления,
      ромбы merge-коммитов и куда смотрят `HEAD` и ветки.
- [ ] Понимаю разницу **fast-forward vs 3-way merge** и знаю, **когда нужен `--no-ff`**.
- [ ] Знаю, что у **merge-коммита два родителя**, и могу показать это через `cat-file`.
- [ ] Спокойно **разрешаю конфликт**: читаю маркеры `<<<<<<< / ======= / >>>>>>>`,
      собираю корректный код, делаю `git add` и завершаю слияние `git commit`.
- [ ] Помню про аварийный `git merge --abort`.
- [ ] Различаю `git branch -d` / `-D` и умею переименовать ветку через `-m`.

---

## Шпаргалка команд модуля 3

```bash
# ветки
git switch -c feature/x        # создать ветку и перейти на неё (вместо checkout -b)
git switch main                # переключиться на существующую ветку
git branch                     # список локальных веток (* = текущая)
git branch -vv                 # ветки + последний коммит
git branch -m old new          # переименовать ветку
git branch -d feature/x        # удалить СЛИТУЮ ветку (безопасно)
git branch -D feature/x        # удалить ветку принудительно (опасно)

# слияния
git merge feature/x            # слить (fast-forward, если main не двигался)
git merge --no-ff feature/x    # всегда создать merge-коммит
git merge --no-ff -m "..." x   # с готовым сообщением (не открывать редактор)
git merge --abort              # аварийно отменить слияние с конфликтом

# конфликт: разрешение
git status                     # увидеть unmerged paths во время конфликта
# ... вручную убрать маркеры <<<<<<< ======= >>>>>>> и собрать код ...
git add <file>                 # пометить конфликт разрешённым
git commit                     # завершить слияние (merge-коммит)
git mergetool                  # визуальный 3-way merge во внешнем инструменте

# граф истории
git log --oneline --graph --decorate --all
git cat-file -p HEAD           # увидеть две строки parent у merge-коммита
```

---

## Домашнее задание

Живой пример выше показал ветку `feature/filters` и конфликт по фильтрации/сортировке.
В ДЗ вы пройдёте те же навыки (ветки → merge → конфликт → разрешение → уборка), но на
**другом сценарии**: две независимые ветки правят функцию `sortTasks` по-разному и
конфликтуют. Чтобы не задеть основную работу, сделайте отдельную копию проекта
обычным копированием папки (или, если хотите, тренируйтесь прямо в текущем репозитории):

```bash
cp -r <путь-к-taskflow> ~/taskflow-hw && cd ~/taskflow-hw
```

### Постановка (по шагам)

1. Убедитесь, что вы на `main` и история чистая: `git switch main`, `git status`.
2. Создайте ветку **`feature/sort-by-title`** через `git switch -c`. В ней измените
   `sortTasks` в `src/utils/taskUtils.ts` так, чтобы внутри групп (выполнено /
   не выполнено) задачи шли **по заголовку A→Z** (`a.title.localeCompare(b.title)`).
   Закоммитьте: `feat(sort): order by title within groups`.
3. Вернитесь на `main` (`git switch main`) и создайте **вторую** ветку
   **`feature/sort-by-date`**. В ней измените **тот же блок** `sortTasks` иначе —
   сортировка **по дате создания, новые сверху** (`b.createdAt - a.createdAt`).
   Закоммитьте: `feat(sort): newest first within groups`.
4. Слейте первую ветку в `main` обычным `git merge feature/sort-by-title`
   (ожидается fast-forward — запишите, был ли он).
5. Теперь слейте вторую ветку: `git merge --no-ff feature/sort-by-date`.
   **Получите конфликт** в `sortTasks` (обе ветки правили один блок).
6. Прочитайте `git status` и маркеры конфликта. **Разрешите его, сохранив обе
   нужные стратегии**: вынесите критерий сортировки в **параметр функции**, например
   `sortTasks(tasks, by: 'title' | 'date' = 'title')`, чтобы обе ветки «остались в
   деле», а не одна вместо другой.
7. Завершите слияние: `git add` → `git commit` (merge-коммит).
8. Удалите обе слитые ветки через `git branch -d`.
9. Создайте ветку `tmp/experiment`, переименуйте её в `feature/sort-ui` через
   `git branch -m`, затем удалите её через `git branch -D` (она не слита — увидите,
   чем `-D` отличается от `-d`).

### Критерии «сделано»

- [ ] В `git log --oneline --graph --decorate` виден **ровно один merge-коммит**
      (от `--no-ff`) с расходящимися и снова сходящимися линиями.
- [ ] У этого merge-коммита **две строки `parent`** (`git cat-file -p <hash>`).
- [ ] В `src/utils/taskUtils.ts` **не осталось ни одного** маркера
      `<<<<<<<`, `=======`, `>>>>>>>`.
- [ ] Функция `sortTasks` принимает параметр стратегии и **корректно поддерживает обе**
      сортировки (по заголовку и по дате). Тесты `tests/taskUtils.test.ts` проходят
      (или вы дописали проверки на обе ветки логики).
- [ ] Веток `feature/sort-by-title`, `feature/sort-by-date`, `feature/sort-ui`
      больше нет в `git branch`.

### Подсказки

- Проверить разрешение, что не осталось маркеров:
  `git grep -nE '^(<<<<<<<|=======|>>>>>>>)'` — должно вернуть пусто.
- Запутались в середине конфликта — `git merge --abort` вернёт всё к началу шага 5,
  попробуете заново. Это не «провал», а нормальный рабочий приём.
- Если `git branch -d` ругается «not fully merged» — это защита: либо ветка
  действительно не слита (тогда `-D`, если работа не нужна), либо вы слили её не в ту
  ветку.
- Параметр со значением по умолчанию (`by: SortBy = 'title'`) не сломает существующие
  вызовы `sortTasks(tasks)` в `src/state/tasksStore.ts` / компонентах.

### Самопроверка (ответьте себе словами)

1. Почему слияние на шаге 4 было fast-forward, а на шаге 5 — нет?
2. Что именно сделал `git add` на шаге 7 — *кроме* постановки файла в индекс?
3. Чем `-d` отличается от `-D` и почему по умолчанию безопаснее `-d`?
4. Сколько родителей у вашего merge-коммита и что означает каждый из них?
