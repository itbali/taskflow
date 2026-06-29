# Модуль 6. Удалённые репозитории и совместная работа

> **Цель модуля.** Научиться **синхронизироваться** с удалёнкой (которую подключили в
> модуле 5): понимать **tracking-ветки** и **upstream**, чётко различать `fetch` и
> `pull`, осознанно интегрировать чужие изменения (`--ff-only` vs `--rebase` vs обычный
> merge), разрешать конфликт при `pull` и проводить свою фичу в общий код **через Pull
> Request** с ревью и защищённой веткой.

Этот документ продолжает живой пример на `taskflow`: в модуле 5 мы создали `origin` на
GitHub и опубликовали историю. Теперь учимся **жить с удалёнкой** — подтягивать чужое и
отдавать своё.

> 🧩 **Один разработчик — а сценарии командные.** Чтобы воспроизвести «в общий репозиторий
> запушил кто-то ещё», нам не нужен второй человек: мы будем **двигать `origin` сами,
> коммитя прямо в вебе GitHub** (на файле значок ✏️ → *Commit changes*). Такой коммит
> появляется на сервере, но не в вашем локальном репозитории — ровно как если бы запушил
> коллега или вы со второй машины. Так одним разработчиком разыгрываются «удалёнка ушла
> вперёд», расхождение и даже конфликт. Все выводы ниже — настоящие; отличаться будут
> только хеши (SHA-1).

---

## Мысленная модель (прочитать до команд)

В модуле 5 мы выяснили, что `origin` — это **ещё одна копия** репозитория на сервере, а
`git push -u` ставит **upstream**-связь. Теперь три идеи именно про синхронизацию:

1. **Remote-tracking ветка — это локальный кэш состояния удалёнки.** `origin/main` — это
   **не** ваша ветка `main` и **не** живая ветка на сервере. Это снимок «где был `main`
   на сервере **в момент последнего `fetch`**». Обновляется ТОЛЬКО командами, которые
   ходят в сеть (`fetch`, `pull`, `push`). Пока вы не сделали `fetch`, Git честно думает,
   что удалёнка там же, где была.

   ```
   ваша ветка main  ──tracks──►  origin/main  ──fetch──►  сервер (origin)
   (локальная,                    (кэш, обновляется         (источник правды,
    вы коммитите сюда)             только по сети)            общий для всех)
   ```

2. **`fetch` ≠ `pull`.** Запомните одно равенство:

   ```
   git pull  =  git fetch  +  git merge (или git rebase)
   ```

   - `git fetch` — **только скачивает** новые коммиты и двигает `origin/*`. Ваши рабочие
     ветки и файлы на диске **не трогаются**. Безопасно всегда.
   - `git pull` — скачивает И сразу **вливает** в текущую ветку. Именно «вливание»
     порождает либо fast-forward, либо merge-коммит, либо rebase.

3. **Сначала смотреть, потом вливать.** Правильная привычка: `git fetch` → посмотреть
   (`git status -sb`, `git log main..origin/main`) → осознанно выбрать способ интеграции.
   Никогда не вливать вслепую.

---

## Шаг 0. Стартовая точка: удалёнка уже подключена

После модуля 5 у нас есть `origin` и upstream у `main`. Проверим:

```bash
git remote -v
git branch -vv
git status -sb
```

**Вывод:**

```
origin  git@github.com:<user>/taskflow.git (fetch)
origin  git@github.com:<user>/taskflow.git (push)
```
```
* main 7f3d2a1 [origin/main] feat: render task priority
```
```
## main...origin/main
```

- `[origin/main]` в `git branch -vv` — это **upstream**: локальная `main` отслеживает
  `origin/main`. Благодаря ему `git pull`/`git push` без аргументов знают, куда идти, а
  `git status` считает ahead/behind.
- `## main...origin/main` без `[ahead/behind]` — три состояния синхронны.

---

## Шаг 1. Удалёнка ушла вперёд: `fetch` показывает, но не вливает

Сымитируем «коллега запушил»: **в вебе GitHub** открываем `README.md`, нажимаем ✏️,
добавляем строчку и **Commit changes** прямо в `main`. На сервере появился коммит,
которого нет локально.

Ключевой момент: **пока вы не сходите в сеть, Git об этом коммите не знает.**

```bash
git status -sb          # ДО fetch — Git думает, что всё синхронно
git fetch               # только скачивает
git status -sb          # ПОСЛЕ fetch
git log --oneline main..origin/main   # что есть на сервере, но нет у меня
```

**Вывод `git status -sb` ДО fetch:**

```
## main...origin/main
```

**Вывод `git fetch`:**

```
From github.com:<user>/taskflow
   7f3d2a1..b4e9c02  main       -> origin/main
```

**Вывод `git status -sb` ПОСЛЕ fetch:**

```
## main...origin/main [behind 1]
```

**Вывод `git log main..origin/main`:**

```
b4e9c02 docs: add build badges to README
```

**Объяснение — это сердце модуля:**
- ДО `fetch` статус чистый: Git **не ходит в сеть сам**.
- `git fetch` обновил **только** `origin/main` (`7f3d2a1..b4e9c02 -> origin/main`). Файлы
  на диске, ваша `main` и `HEAD` — **не тронуты**. В этом весь смысл `fetch`: «скачать и
  показать, ничего не вливая».
- После `fetch` статус честно говорит `[behind 1]` — локальная `main` отстала на 1 коммит.
- `git log main..origin/main` — идиома «покажи коммиты, что есть на удалёнке, но нет у
  меня». Так смотрят расхождение **до** интеграции.

---

## Шаг 2. Чистая интеграция: `git pull --ff-only`

Локальная `main` своих коммитов не содержит — только отстала. Значит, её можно
**перемотать вперёд** (fast-forward) без merge-коммита.

```bash
git pull --ff-only
git status -sb
```

**Вывод:**

```
Updating 7f3d2a1..b4e9c02
Fast-forward
 README.md | 1 +
 1 file changed, 1 insertion(+)
```
```
## main...origin/main
```

**Объяснение:**
- `Fast-forward` — Git просто **передвинул указатель** `main` на `b4e9c02`. Новой «точки
  слияния» не создано, история линейна.
- `--ff-only` — «предохранитель»: интегрировать ТОЛЬКО если получается перемотка, иначе
  отказаться и ничего не делать. Самый предсказуемый способ подтянуть `main`.

> 💡 Сделайте это поведением по умолчанию: `git config --global pull.ff only`. Тогда
> `git pull` либо аккуратно перемотает, либо честно остановится и заставит выбрать merge
> или rebase — вместо «случайного» merge-коммита.

---

## Шаг 3. Расхождение: когда `--ff-only` ПАДАЕТ (и это правильно)

Теперь сложнее. Создадим **расхождение** в одиночку:

1. **В вебе GitHub** правим `README.md` ещё раз → коммит `c1d2e3f` в `main` на сервере.
2. **Локально** делаем свой коммит в `main` — не подтянув сначала сервер:

```bash
# меняем src/version.ts, коммитим локально
git commit -am "chore: bump app version to 0.3.0"   # -> 981692f
git fetch
git status -sb
git pull --ff-only
```

**Вывод `git status -sb` (после fetch):**

```
## main...origin/main [ahead 1, behind 1]
```

**Вывод `git pull --ff-only`:**

```
hint: Diverging branches can't be fast-forwarded, you need to either:
hint:
hint: 	git merge --no-ff
hint:
hint: or:
hint: 	git rebase
hint:
fatal: Not possible to fast-forward, aborting.
```

**Объяснение:**
- `[ahead 1, behind 1]` — **расхождение**: 1 свой коммит вперёд И 1 чужой позади.
  Перемотать нельзя — у локальной ветки уже есть собственная история.
- `--ff-only` честно **отказался** и **ничего не сломал**. Это фича: вас не пустили
  вслепую создавать merge. Дальше выбираем способ осознанно.

---

## Шаг 4. Интеграция расхождения через `git pull --rebase`

Чтобы история осталась **линейной** (без лишних merge-коммитов), переносим свой коммит
поверх обновлённого сервера:

```bash
git pull --rebase
git log --oneline --graph --decorate -n 4
git status -sb
```

**Вывод `git pull --rebase`:**

```
Successfully rebased and updated refs/heads/main.
```

**Вывод графа:**

```
* 598e082 (HEAD -> main) chore: bump app version to 0.3.0
* c1d2e3f (origin/main) docs: clarify README usage
* b4e9c02 docs: add build badges to README
* 7f3d2a1 feat: render task priority
```

**Вывод `git status -sb`:**

```
## main...origin/main [ahead 1]
```

**Объяснение:**
- `--rebase` = `fetch` + `rebase`: Git «отмотал» ваш коммит, перемотал `main` на серверный
  `c1d2e3f`, затем **переприменил** ваш коммит сверху. Его хеш изменился
  (`981692f` → `598e082`) — это новый коммит с тем же diff.
- Граф **линейный** — ни одного ветвления. Сравните со следующим шагом.
- `[ahead 1]` — теперь вы ровно на 1 коммит впереди сервера; его можно `git push`.

```bash
git push        # upstream стоит — аргументы не нужны
```

> ⚠️ Золотое правило rebase: **не перебазируйте уже опубликованные/общие коммиты.** Здесь
> ваш коммит был только локальным — переписывать его безопасно. Перебазировать ветку,
> которую кто-то уже скачал, — путь к конфликтам у коллег (подробно — модуль 7).

---

## Шаг 5. Контрпример: обычный `git pull` плодит merge-коммиты

Чтобы увидеть **типичную ошибку**, повторим расхождение, но интегрируем обычным `pull`
(merge). Снова: один коммит в вебе GitHub (`d4f5a6b`) + один локальный.

```bash
git commit -am "chore: add feature-flags placeholder"   # локальный коммит
git fetch
git config pull.rebase false      # явный merge-режим (на одну команду)
git pull
git log --oneline --graph --decorate -n 5
```

**Вывод `git pull`:**

```
Merge made by the 'ort' strategy.
 README.md | 2 ++
 1 file changed, 2 insertions(+)
```

**Вывод графа:**

```
*   8afe2de (HEAD -> main) Merge branch 'main' of github.com:<user>/taskflow
|\
| * d4f5a6b (origin/main) docs: add FAQ section
* | ccd2790 chore: add feature-flags placeholder
|/
* 598e082 chore: bump app version to 0.3.0
* ...
```

**Объяснение:**
- `Merge made by the 'ort' strategy` — Git создал **отдельный merge-коммит** `8afe2de` с
  **двумя родителями** (`|\` в графе). Никакого содержательного diff он не несёт — только
  «склейку».
- В истории появился «ромб». Когда так интегрируют каждую мелкую синхронизацию, граф
  превращается в спагетти из бессодержательных `Merge branch 'main' of ...`.
- Именно от этого спасают `pull.ff only` и `pull --rebase`. Merge-коммиты уместны для
  **слияния законченных фич** (через PR), а не для рутинного «подтянуть main».

---

## Шаг 6. Конфликт при `pull` и его разрешение

Конфликт возникает, когда вы и сервер изменили **одни и те же строки**. Разыграем это в
одиночку:

1. **В вебе GitHub** правим в `src/utils/taskUtils.ts` тело функции `sortTasks` → коммит
   на сервере.
2. **Локально** правим **ту же строку** той же функции и коммитим.

```bash
git commit -am "feat(sort): sort by createdAt desc"
git pull --rebase
```

**Вывод:**

```
Auto-merging src/utils/taskUtils.ts
CONFLICT (content): Merge conflict in src/utils/taskUtils.ts
error: could not apply 7c1aa2e... feat(sort): sort by createdAt desc
hint: Resolve all conflicts manually, mark them as resolved with
hint: "git add/rm <conflicted files>", then run "git rebase --continue".
```

Открываем файл — внутри маркеры конфликта (их мы разбирали в модуле 3):

```
<<<<<<< HEAD
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt)
=======
  return [...tasks].sort((a, b) => a.title.localeCompare(b.title))
>>>>>>> 7c1aa2e (feat(sort): sort by createdAt desc)
```

- сверху (`HEAD`) — версия **с сервера** (на неё мы перебазируемся);
- снизу — **ваш** переприменяемый коммит.

Оставляем нужный вариант (или совмещаем), убираем маркеры, затем:

```bash
git add src/utils/taskUtils.ts
git rebase --continue        # продолжить; откатить всё — git rebase --abort
```

**Вывод:**

```
Successfully rebased and updated refs/heads/main.
```

**Объяснение:**
- Конфликт при `pull --rebase` решается так же, как обычный merge-конфликт: правим файл →
  `git add` → но дальше **`git rebase --continue`** (а не `git commit`).
- `git rebase --abort` вернёт всё в состояние до `pull`, если решили не разбираться сейчас.

---

## Шаг 7. Своя фича через ветку и Pull Request

Прямой push в `main` в команде не принят (а часто и запрещён — см. шаг 9). Фичу проводят
через ветку и PR.

```bash
git switch -c feature/sort-tasks
# ... правим src/utils/taskUtils.ts, коммитим ...
git commit -am "feat(utils): add sort flag for tasks"
git push -u origin feature/sort-tasks
```

**Вывод push:**

```
remote: Create a pull request for 'feature/sort-tasks' on GitHub by visiting:
remote:      https://github.com/<user>/taskflow/pull/new/feature/sort-tasks
To github.com:<user>/taskflow.git
 * [new branch]      feature/sort-tasks -> feature/sort-tasks
branch 'feature/sort-tasks' set up to track 'origin/feature/sort-tasks'.
```

- `-u` поставил upstream и для этой ветки — дальше в ней достаточно `git push`/`git pull`.
- Чтобы upstream ставился автоматически при первом push: один раз
  `git config --global push.autoSetupRemote true`, и `-u` можно не писать.

Открываем Pull Request — через баннер **«Compare & pull request»** в вебе GitHub (base =
`main`, compare = `feature/sort-tasks`, заголовок/описание, reviewers) или из терминала:

```bash
gh pr create --base main --head feature/sort-tasks \
  --title "feat(utils): sort flag for tasks" \
  --body "Adds sort flag. How to test: npm test."
```

```
Creating pull request for feature/sort-tasks into main in <user>/taskflow
https://github.com/<user>/taskflow/pull/7
```

---

## Шаг 8. Ревью и merge через PR

**Цикл ревью:**
1. Ревьюер во вкладке **Files changed** оставляет inline-комментарии и выбирает
   **Request changes** или **Approve**.
2. Автор отвечает и **дописывает коммит в ту же ветку** — PR обновляется сам, новый PR
   создавать не нужно:

   ```bash
   git switch feature/sort-tasks
   # правим по замечаниям
   git commit -am "refactor(utils): rename flag per review"
   git push                 # upstream уже стоит — просто git push
   ```

3. После **Approve** и зелёного CI жмём **Merge pull request**. Варианты слияния:
   - **Merge commit** — сохраняет все коммиты ветки + merge-коммит;
   - **Squash and merge** — схлопывает ветку в один коммит в `main` (частый выбор);
   - **Rebase and merge** — переносит коммиты в `main` линейно.

   Через CLI: `gh pr merge 7 --squash --delete-branch`.

4. Подтягиваем результат и убираем ветку:

   ```bash
   git switch main
   git pull --ff-only           # main теперь содержит влитую фичу
   git branch -d feature/sort-tasks
   git fetch --prune            # убрать устаревший origin/feature/sort-tasks
   ```

---

## Шаг 9. Защищённые ветки (branch protection)

Настраивается в вебе GitHub: **Settings → Branches → Add rule**. Типичная защита `main`:
**Require a pull request before merging** + **Require approvals** (≥1) + **Require status
checks** + запрет прямого push. Тогда push прямо в `main` сервер **отвергает**:

```bash
git switch main
git commit -am "hotfix prod"
git push origin main
```

**Вывод (ветка защищена):**

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Changes must be made through a pull request.
 ! [remote rejected] main -> main (protected branch hook declined)
error: failed to push some refs to 'github.com:<user>/taskflow.git'
```

**Объяснение:** это не ошибка вашего Git, а **серверное правило**: в `main` можно попасть
только через PR. Лекарство — завести ветку, запушить и открыть PR (шаги 7–8).

---

## Типичные ошибки модуля 6

- ❌ **`pull`, плодящий merge-коммиты.** Рутинная синхронизация обычным `git pull` (merge)
  засоряет историю «ромбами». Лечится `git config --global pull.ff only` и `pull --rebase`.
- ❌ **Путать локальную и удалённую ветки.** `origin/main` — это **кэш** на момент
  последнего `fetch`, а не «живая» ветка. Перед интеграцией всегда `git fetch` +
  `git log main..origin/main`.
- ❌ **Думать, что `fetch` что-то вливает.** `fetch` только двигает `origin/*`; файлы и
  ваша ветка не меняются. Вливает — `pull`/`merge`/`rebase`.
- ❌ **Push в защищённую ветку напрямую.** `[remote rejected] ... protected branch` —
  работайте через ветку + PR.
- ❌ **Забыть upstream** и каждый раз писать длинный `git push origin <branch>`. Один раз
  `git push -u` (или `push.autoSetupRemote true`) — и дальше просто `git push`.
- ❌ **Rebase уже опубликованных коммитов**, которые скачали коллеги, — переписывание
  общей истории ломает их клоны.

---

## Чек-лист модуля 6

- [ ] Объясняю, чем `origin/main` отличается от локальной `main` (кэш vs рабочая ветка).
- [ ] Чётко различаю **`fetch`** (только скачать) и **`pull`** (`fetch` + влить).
- [ ] Читаю `ahead/behind` в `git status -sb` и `git log main..origin/main`.
- [ ] Использую `pull --ff-only` и понимаю, **почему** и **когда** он падает.
- [ ] Интегрирую расхождение через `pull --rebase`, сохраняя линейную историю.
- [ ] Умею разрешить **конфликт при `pull`** (`add` → `rebase --continue`).
- [ ] Провожу фичу через **Pull Request** с ревью и merge.
- [ ] Понимаю, что **защищённая ветка** не принимает прямой push.

---

## Шпаргалка команд модуля 6

```bash
# смотреть удалёнку, ничего не вливая
git fetch                          # обновить origin/* (без изменения ваших веток)
git fetch --prune                  # + удалить устаревшие origin/*-ветки
git status -sb                     # ## main...origin/main [ahead/behind]
git log --oneline main..origin/main# что есть на сервере, но нет у меня
git branch -vv                     # локальные ветки + их upstream

# интеграция чужих изменений
git pull --ff-only                 # влить ТОЛЬКО перемоткой (без merge-коммитов)
git pull --rebase                  # влить, переприменив свои коммиты сверху (линейно)
git config --global pull.ff only   # сделать --ff-only поведением по умолчанию
# конфликт при rebase: правим файл → git add <file> → git rebase --continue (или --abort)

# публикация ветки и PR
git push -u origin feature/x       # запушить + поставить upstream (далее просто git push)
git config --global push.autoSetupRemote true   # ставить upstream автоматически
gh pr create --base main --head feature/x --title "..." --body "..."
gh pr merge <N> --squash --delete-branch

# уборка после merge
git switch main && git pull --ff-only
git branch -d feature/x
```

---

## Домашнее задание

> Сценарий **другой**, чем в живом примере. Вы в одиночку, на своём GitHub-репозитории
> (из модуля 5), разыгрываете приход чужих изменений через правки в вебе GitHub, ловите
> расхождение и проводите фичу через PR с защитой ветки.

### Часть A. Удалёнка ушла вперёд → fetch и ff-only

1. **В вебе GitHub** измените `README.md` и закоммитьте прямо в `main` (✏️ → Commit changes).
2. Локально, **не коммитя ничего**, сделайте `git fetch`. Зафиксируйте вывод
   `git status -sb` и `git log --oneline main..origin/main` — докажите, что коммит виден в
   `origin/main`, но локальная `main` его ещё не содержит.
3. Интегрируйте через `git pull --ff-only` — убедитесь, что это fast-forward без
   merge-коммита.

### Часть B. Расхождение → rebase vs merge

4. Спровоцируйте расхождение: один коммит в вебе GitHub + один локальный коммит в `main`.
   Сделайте `git fetch` и убедитесь, что `git pull --ff-only` падает с
   `fatal: Not possible to fast-forward`.
5. Интегрируйте через `git pull --rebase`; покажите, что граф **линейный** (нет `|\`).
6. (Опционально) повторите расхождение и интегрируйте обычным `git pull` — сравните: в
   графе появился merge-«ромб».

### Часть C. Конфликт при pull

7. Измените **одну и ту же строку** в `src/utils/taskUtils.ts` локально и в вебе GitHub.
   Сделайте `git pull --rebase`, разрешите конфликт (`git add` → `git rebase --continue`).

### Часть D. Фича через PR + branch protection

8. Включите защиту `main` (Settings → Branches: требовать PR и ≥1 approve, запретить
   прямой push). Докажите, что прямой `git push origin main` отклонён.
9. Заведите `feature/status-filter`, запушьте с upstream одной командой, откройте PR (UI
   или `gh pr create`), допишите коммит по «ревью» в ту же ветку, влейте **Squash and
   merge**, удалите ветку и подтяните `main` через `git pull --ff-only`.

### Критерии «сделано»

- [ ] Есть вывод, где `git status -sb` показывает `[behind 1]`, затем `[ahead 1, behind 1]`.
- [ ] `--ff-only` на расхождении завершился `fatal: Not possible to fast-forward`.
- [ ] После `--rebase` в `git log --graph` нет ни одного `|\`.
- [ ] Конфликт при `pull --rebase` разрешён через `git add` + `git rebase --continue`.
- [ ] Прямой push в защищённую `main` отклонён; фича влита через PR (squash); ветка удалена.

### Самопроверка

- [ ] Могу объяснить, почему после `git fetch` файлы на диске не изменились.
- [ ] Понимаю разницу между `[behind 1]` и `[ahead 1, behind 1]` и какой из них ломает `--ff-only`.
- [ ] Вижу в `git log --graph`, чем результат `--rebase` отличается от обычного `pull`.
- [ ] На практике убедился, что в защищённую `main` нельзя пушить напрямую — только PR.
