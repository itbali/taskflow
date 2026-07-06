# Модуль 13. Командные workflow и стратегии

> **Цель модуля.** Научиться *выбирать и внедрять* процесс работы с Git под конкретную
> команду, а не копировать чужой вслепую. К концу модуля вы можете аргументированно
> сравнить **Git Flow / GitHub Flow / trunk-based / release-ветки**, владеете
> **Conventional Commits** и **semantic versioning**, и понимаете, как теги, защита
> веток и CI/CD связывают историю с релизами.

Этот документ — разбор «живого примера» модуля 13 на проекте `taskflow`. Часть выводов
команд ниже — **настоящие**, снятые на свежем клоне репозитория. У вас будут отличаться
только хеши (SHA-1) — они зависят от содержимого, имени/почты и времени коммита.
Структура и смысл вывода — те же.

Те фрагменты, которые невозможно «снять» локально без GitHub/CI (защита веток,
`CODEOWNERS`, GitHub Actions, авто-CHANGELOG от `semantic-release`), приведены как
**конфиги-примеры** и явно помечены `пример` / `пример вывода`. Их формат настоящий и
рабочий, но конкретные числа/ссылки в выводе будут вашими.

> ⚠️ Все живые команды выполнялись на отдельном клоне в `/tmp/taskflow-m11`, чтобы не
> трогать основной репозиторий. Если повторяете — делайте так же:
> ```bash
> git clone /path/to/taskflow /tmp/taskflow-m11
> cd /tmp/taskflow-m11
> ```

---

## Мысленная модель (прочитать до команд)

Четыре идеи, на которых держится выбор workflow:

1. **Workflow — это компромисс между скоростью и контролем.** Чем больше «ворот»
   (review, release-ветки, QA-стадии), тем безопаснее, но медленнее. Чем короче путь
   «коммит → прод», тем быстрее обратная связь, но тем выше требования к тестам и
   автоматике. Не существует «правильного» процесса — есть подходящий *под размер
   команды и темп релизов*.

2. **Ветка — это дешёвый указатель, а не «папка с кодом».** Из модуля 0: ветка — это
   просто файл с хешем коммита. Поэтому стоимость стратегии определяется не «ветками
   как таковыми», а тем, *сколько времени* ветка живёт в отрыве от `main` и *насколько
   часто* вы интегрируетесь. Долгоживущая ветка = накопленный конфликт = боль слияния.

3. **Тег — это иммутабельный якорь релиза.** Ветки двигаются, теги — нет. Аннотированный
   тег (`git tag -a`) — это отдельный объект с автором, датой и сообщением (теги подробно
   разобраны в модуле 4). Релиз — это «коммит, на который указывает тег `vX.Y.Z`».

4. **История коммитов — это документация, если её писать по конвенции.** Conventional
   Commits превращают сообщения коммитов в машиночитаемый поток, из которого
   автоматически выводятся **версия** (semver) и **CHANGELOG**. Сообщение коммита
   перестаёт быть «для себя на пять минут» и становится частью релизного процесса.

   ```
   тип(scope): краткое описание        ← Conventional Commit
        │                  │
        ▼                  ▼
   fix → PATCH        строка в CHANGELOG
   feat → MINOR       (раздел Features/Fixes)
   feat! → MAJOR
   ```

---

## Часть A. Стратегии ветвления

### A.1. Четыре стратегии за одну минуту

```
GitHub Flow (одна вечная ветка main + короткие фиче-ветки):

  main  ──●───────●───────●───────●──►   (всегда деплоима)
           \     / \     /
   feat:    ●───●   ●───●                 живёт часы–дни, PR, merge, удалить


Trunk-based (почти прямо в trunk; фиче-флаги вместо долгих веток):

  main  ──●─●─●─●─●─●─●─●─●──►            десятки коммитов/день
           ↑ короткоживущие ветки (<1 дня) или прямые коммиты
           незрелый код прячется за feature flag


Release-ветки (фиксируем срез под релиз, main едет дальше):

  main     ──●───●───●───●───●──►
                    \
  release/1.1        ●──●(fix)──●  → tag v1.1.0    параллельно правим релиз


Git Flow (develop + release + hotfix + main):

  main     ──●───────────────────●(tag)──●(tag)──►
              \                  /       /
  develop      ●──●──●──●──●──●─●──────●─────►
                  \    /        \     /
  feature/release  ●──●          ●───●(release/hotfix)
```

### A.2. Таблица сравнения

| Критерий | GitHub Flow | Trunk-based | Release-ветки | Git Flow |
|---|---|---|---|---|
| Долгоживущих веток | 1 (`main`) | 1 (`trunk`/`main`) | 1 + временные `release/*` | 2 (`main`+`develop`) + temp |
| Время жизни фиче-ветки | часы–дни | минуты–часы (или прямо в trunk) | дни | дни–недели |
| Темп релизов | непрерывный / по готовности | несколько раз в день (CD) | по расписанию (sprint/квартал) | по расписанию, тяжёлые релизы |
| Размер команды | маленькая–средняя | средняя–большая (зрелый CI) | средняя–большая | средняя–большая |
| Поддержка нескольких версий в проде | плохо | плохо | хорошо | хорошо |
| Требования к автотестам/CI | высокие | очень высокие | средние | средние |
| Когнитивная нагрузка | низкая | низкая (но нужна культура флагов) | средняя | высокая |
| Главный риск | прямой merge без ревью | сломать trunk | забыть back-merge fix в main | тяжесть в маленькой команде |

**Как выбирать (правило большого пальта):**
- Команда 2–8, веб-сервис, деплой по готовности → **GitHub Flow**.
- Команда зрелая, CD несколько раз в день, дисциплина флагов → **trunk-based**.
- Нужно поддерживать версии у клиентов / релизы по расписанию → **release-ветки** (как
  лёгкая надстройка над GitHub Flow) или **Git Flow** (если стадий QA много).
- Десктоп/мобайл/библиотека с долгим циклом и параллельными версиями → **Git Flow**.

---

## Часть B. Живой пример — GitHub Flow на `taskflow`

GitHub Flow: от `main` отводим короткую фиче-ветку, делаем 1–2 коммита, открываем PR,
сливаем обратно, ветку удаляем. Прогон на свежем клоне (все выводы настоящие):

```bash
git checkout -b feat/filter-active
# ... правим src/utils/taskUtils.ts: добавили countActive() ...
git add -A
git commit -m "feat(tasks): add countActive helper"
```

**Вывод коммита:**

```
[feat/filter-active 37558bf] feat(tasks): add countActive helper
 1 file changed, 5 insertions(+)
```

В реальной команде здесь вы бы сделали `git push -u origin feat/filter-active` и открыли
PR на GitHub. Локально эмулируем «merge PR» с явным merge-коммитом (`--no-ff`), чтобы в
истории осталась видимая «точка слияния PR»:

```bash
git checkout main
git merge --no-ff feat/filter-active -m "Merge PR #12: feat(tasks): add countActive helper"
git branch -d feat/filter-active
```

**Вывод:**

```
Merge made by the 'ort' strategy.
 src/utils/taskUtils.ts | 5 +++++
 1 file changed, 5 insertions(+)
Deleted branch feat/filter-active (was 37558bf).
```

**Граф после GitHub Flow** (`git log --oneline --graph --all`):

```
*   a25b7ee Merge PR #12: feat(tasks): add countActive helper
|\
| * 37558bf feat(tasks): add countActive helper
|/
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Что важно:** ветка прожила один коммит и сразу влилась. `main` остаётся деплоимой в
любой момент. Это и есть суть GitHub Flow — минимум долгоживущих веток.

> 💡 `--no-ff` (no fast-forward) заставляет Git создать merge-коммит даже когда можно
> «перемотать» указатель. В реальной жизни этим управляет настройка PR на GitHub
> («Create a merge commit» vs «Squash» vs «Rebase»). Squash-merge даёт ровно один
> чистый коммит на PR — частый выбор для GitHub Flow.

---

## Часть C. Живой пример — Git Flow: релиз + параллельный хотфикс

Теперь сложный сценарий, ради которого Git Flow вообще существует: мы **готовим релиз
1.1** в release-ветке, и в этот же момент **в проде находят баг**, который надо
выпустить как **хотфикс 1.0.1**, не дожидаясь релиза.

Сначала закрепим текущий `main` как первый релиз:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
```

> `-a` = annotated (аннотированный) тег — для релизов всегда используйте именно его
> (разница лёгкий/аннотированный, публикация и semver разобраны в модуле 4).

### C.1. develop + feature

```bash
git checkout -b develop main
git checkout -b feature/sort-by-title develop
# ... добавили src/utils/sort.ts ...
git add -A && git commit -m "feat(tasks): add sortByTitle helper"
git checkout develop
git merge --no-ff feature/sort-by-title -m "Merge feature/sort-by-title into develop"
git branch -d feature/sort-by-title
```

### C.2. Открываем release-ветку

```bash
git checkout -b release/1.1 develop
git commit --allow-empty -m "chore(release): bump version to 1.1.0"
```

В release-ветке только стабилизация: бамп версии, правка CHANGELOG, мелкие багфиксы.
Новые фичи сюда **не добавляют** — они продолжают литься в `develop`.

### C.3. Параллельный хотфикс от `main`

Баг в проде. Хотфикс отводится **от `main`** (не от develop!), потому что в develop уже
есть незарелиженный код:

```bash
git checkout -b hotfix/1.0.1 main
# ... добавили src/utils/guard.ts: safeCount() ...
git add -A && git commit -m "fix(tasks): guard count against null input"
```

**Закрываем хотфикс** — вливаем в `main`, ставим тег, и обязательно **back-merge** в
develop (иначе фикс потеряется в следующем релизе):

```bash
git checkout main
git merge --no-ff hotfix/1.0.1 -m "Merge hotfix/1.0.1 into main"
git tag -a v1.0.1 -m "Hotfix release v1.0.1"
git checkout develop
git merge --no-ff hotfix/1.0.1 -m "Merge hotfix/1.0.1 into develop"
git branch -d hotfix/1.0.1
```

> ⚠️ Если хотфикс и фича трогают **один файл**, back-merge даст реальный конфликт:
> ```
> CONFLICT (content): Merge conflict in src/utils/taskUtils.ts
> Automatic merge failed; fix conflicts and then commit the result.
> ```
> Это не баг процесса, а его цена: в Git Flow один фикс приходится мёрджить в несколько
> веток, и каждое слияние — потенциальный конфликт. Разрешается как обычно (модуль 3):
> правим файл, `git add`, `git commit`.

### C.4. Закрываем релиз

Хотфикс попал и в `main`, и в `develop`, но **не в release-ветку** — подтягиваем его
туда, потом вливаем релиз в `main` (тег!) и обратно в `develop`:

```bash
git checkout release/1.1
git merge --no-ff develop -m "Merge develop (hotfix) into release/1.1"
git checkout main
git merge --no-ff release/1.1 -m "Merge release/1.1 into main"
git tag -a v1.1.0 -m "Release v1.1.0"
git checkout develop
git merge --no-ff release/1.1 -m "Merge release/1.1 into develop"
git branch -d release/1.1
```

### C.5. Итоговый граф (настоящий вывод)

`git log --oneline --graph --all --decorate`:

```
*   927ede7 (HEAD -> develop) Merge release/1.1 into develop
|\
| | *   b385ce3 (tag: v1.1.0, main) Merge release/1.1 into main
| | |\
| | |/
| |/|
| * |   33c70c7 Merge develop (hotfix) into release/1.1
| |\ \
| |/ /
|/| |
* | |   5d9379b Merge hotfix/1.0.1 into develop
|\ \ \
| | * | 4d48086 chore(release): bump version to 1.1.0
| |/ /
|/| |
* | |   50446c0 Merge feature/sort-by-title into develop
|\ \ \
| * | | 048c5fb feat(tasks): add sortByTitle helper
|/ / /
| | * d80c7b5 (tag: v1.0.1) Merge hotfix/1.0.1 into main
| |/|
|/|/
| * 56231c2 fix(tasks): guard count against null input
|/
*   a25b7ee (tag: v1.0.0) Merge PR #12: feat(tasks): add countActive helper
|\
| * 37558bf feat(tasks): add countActive helper
|/
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Сравните с GitHub Flow выше.** Один и тот же объём работы (одна фича + один фикс)
породил кучу merge-коммитов и переплетённый граф. Зато у нас есть три релиза с тегами:

```
$ git tag -n
v1.0.0          Release v1.0.0
v1.0.1          Hotfix release v1.0.1
v1.1.0          Release v1.1.0
```

А «то, что видит пользователь `main`» (только релизные точки) — это
`git log --oneline --graph --first-parent main`:

```
* b385ce3 Merge release/1.1 into main
* d80c7b5 Merge hotfix/1.0.1 into main
* a25b7ee Merge PR #12: feat(tasks): add countActive helper
* 2381b21 docs: add module 0 walkthrough (objects, three trees, first commit)
* 6061d7c chore: initial taskflow scaffold (Vite + React + TS)
```

**Вывод сравнения:** Git Flow даёт строгий контроль над параллельными версиями ценой
сложности. Для одного веб-сервиса с непрерывным деплоем это оверкилл — GitHub Flow или
trunk-based решают ту же задачу проще. Git Flow окупается, когда вам *действительно*
нужно поддерживать несколько версий в проде.

---

## Часть D. Conventional Commits + Semantic Versioning

### D.1. Формат Conventional Commits

```
<type>(<scope>)<!>: <subject>
<пустая строка>
<body>
<пустая строка>
<footer>
```

| Тип | Назначение | Влияние на semver |
|---|---|---|
| `feat` | новая функциональность | **MINOR** (0.x.0) |
| `fix` | исправление бага | **PATCH** (0.0.x) |
| `docs` | только документация | — |
| `style` | форматирование, без логики | — |
| `refactor` | рефактор без фич и фиксов | — |
| `perf` | улучшение производительности | PATCH |
| `test` | тесты | — |
| `build` / `ci` | сборка / CI-конфиг | — |
| `chore` | рутина (зависимости, релиз) | — |

**Breaking change** = MAJOR. Помечается двумя способами:

```
feat(api)!: drop support for legacy task format

BREAKING CHANGE: tasks without an id are no longer accepted.
```

Восклицательный знак `!` после типа/scope **и/или** футер `BREAKING CHANGE:` → версия
прыгает в **MAJOR** (1.0.0 → 2.0.0).

### D.2. Semantic Versioning (semver)

```
   MAJOR . MINOR . PATCH
     │       │       └── обратно совместимые багфиксы (fix)
     │       └────────── обратно совместимые фичи (feat)
     └────────────────── несовместимые изменения (feat! / BREAKING CHANGE)
```

Связь прямая: тип коммита → бамп версии → тег `vX.Y.Z`. Именно это и автоматизируют
инструменты ниже.

### D.3. Реальные conventional-коммиты в нашем графе

Коммиты из живого примера уже написаны по конвенции — посмотрим их как поток для
будущего CHANGELOG (`git log v1.0.0..v1.1.0 --no-merges --pretty=format:"%s (%h)"`):

```
fix(tasks): guard count against null input (56231c2)
chore(release): bump version to 1.1.0 (4d48086)
feat(tasks): add sortByTitle helper (048c5fb)
```

Здесь есть `feat` (→ MINOR) и `fix` (→ PATCH). Старшее изменение — `feat`, значит от
1.0.x версия поднимается до **1.1.0**. `chore` в CHANGELOG не попадёт. Логику бампа
делает машина — нам остаётся писать корректные сообщения.

### D.4. Автогенерация версии и CHANGELOG

Два популярных инструмента (оба читают Conventional Commits):

| Инструмент | Что делает | Где обычно запускается |
|---|---|---|
| `standard-version` / `commit-and-tag-version` | локально бампит версию в `package.json`, генерит CHANGELOG, ставит тег | вручную перед релизом |
| `semantic-release` | полностью автоматически: версия + CHANGELOG + git tag + GitHub Release + npm publish | в CI на каждый push в `main` |

**Конфиг `.releaserc.json` (пример, `semantic-release`):**

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", "package.json"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    "@semantic-release/github"
  ]
}
```

**Конфиг `.versionrc` (пример, `standard-version`):** разделы CHANGELOG по типам:

```json
{
  "types": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance" },
    { "type": "chore", "hidden": true },
    { "type": "docs", "hidden": true }
  ]
}
```

**Пример вывода** `npx standard-version` (формат настоящий, числа — иллюстративные):

```
✔ bumping version in package.json from 1.0.1 to 1.1.0
✔ created CHANGELOG.md
✔ outputting changes to CHANGELOG.md
✔ committing package.json and CHANGELOG.md
✔ tagging release v1.1.0
ℹ Run `git push --follow-tags origin main` to publish
```

**Пример сгенерированного `CHANGELOG.md`** (под Conventional Commits из D.3):

```markdown
# Changelog

## [1.1.0](https://github.com/itbali/taskflow/compare/v1.0.1...v1.1.0) (2026-06-20)

### Features

* **tasks:** add sortByTitle helper ([048c5fb](https://github.com/itbali/taskflow/commit/048c5fb))

## [1.0.1](https://github.com/itbali/taskflow/compare/v1.0.0...v1.0.1) (2026-06-20)

### Bug Fixes

* **tasks:** guard count against null input ([56231c2](https://github.com/itbali/taskflow/commit/56231c2))
```

> 💡 Локально CHANGELOG можно собрать даже без инструментов — обычным `git log` с
> группировкой по типу (см. ДЗ). Инструменты лишь автоматизируют это и связывают с тегом.

---

## Часть E. Монорепо vs полирепо

| | Монорепо (один репозиторий на всё) | Полирепо (репозиторий на сервис/пакет) |
|---|---|---|
| Атомарный коммит через несколько проектов | да | нет (нужна координация) |
| Переиспользование кода | просто | через публикацию пакетов |
| Изоляция прав/релизов | сложнее | естественная |
| Размер истории/чекаута | растёт быстро | компактный |
| Версионирование релизов | сложнее (нужны теги вида `pkg@1.2.0`) | по репозиторию = просто |
| Инструменты | Nx, Turborepo, pnpm workspaces | обычный Git + реестр пакетов |

Краткое правило: **монорепо** хорош для команд, которые часто меняют код «поперёк»
сервисов и хотят единый CI; **полирепо** — когда сервисы независимы, у них разные
команды/релизные циклы. Тегам в монорепо обычно дают префикс пакета:
`git tag -a web-v1.1.0 -m ...`.

---

## Часть F. Интеграция с CI/CD (примеры конфигов)

Эти артефакты живут в GitHub/CI, не в `git`-плюмбинге, поэтому приведены как **примеры**
(формат рабочий).

### F.1. Проверки на PR — GitHub Actions

`.github/workflows/ci.yml` (**пример**):

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### F.2. Теги как релизы

`.github/workflows/release.yml` (**пример**) — запускается на push тега `v*`:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

Локально релиз = поставить тег и запушить его:

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0          # пуш одного тега
git push --follow-tags          # пуш коммитов + связанных аннотированных тегов
```

### F.3. Защита веток (branch protection)

Настраивается в Settings → Branches на GitHub. Типовой набор для `main` (**пример**):

- Require a pull request before merging (запрет прямого push в `main`).
- Require approvals: 1+ (минимум одно одобрение ревью).
- Require status checks to pass (зелёный CI из F.1 — обязателен).
- Require branches to be up to date before merging.
- Require review from Code Owners (см. F.4).
- Do not allow bypassing the above settings (даже админам).

> ⚠️ Защита веток — это то, что *технически* заставляет команду соблюдать выбранный
> workflow. Без неё «нельзя пушить в main» остаётся пожеланием, а не правилом.

---

## Часть G. Культура ревью

### G.1. CODEOWNERS

Файл `.github/CODEOWNERS` (**пример**) — авто-назначение ревьюеров по путям:

```
# Глобальный владелец по умолчанию
*                       @itbali

# Логика задач — на ревью к автору модуля
/src/utils/             @itbali @taskflow-core
/src/state/             @taskflow-core

# UI-компоненты
/src/components/        @taskflow-ui

# CI и релизы
/.github/               @taskflow-devops
```

В связке с branch protection («Require review from Code Owners») PR в `/src/state/`
нельзя смёржить без одобрения `@taskflow-core`.

### G.2. Шаблон Pull Request

`.github/pull_request_template.md` (**пример**):

```markdown
## Что и зачем
<!-- 1–2 предложения: какую задачу решает PR -->

## Тип изменения
- [ ] feat  - [ ] fix  - [ ] refactor  - [ ] docs  - [ ] chore

## Чек-лист
- [ ] Заголовок PR в формате Conventional Commits
- [ ] Добавлены/обновлены тесты
- [ ] `npm run lint` и `npm test` зелёные локально
- [ ] PR небольшой (< ~400 строк диффа) или разбит на части

## Как проверить
<!-- шаги ручной проверки -->
```

### G.3. Принципы здорового ревью

- **Маленькие PR.** Цель — < ~400 строк диффа. Большой PR ревьюят поверхностно.
- **Draft-PR** для ранней обратной связи: открываете PR в статусе Draft, когда работа не
  готова, но хотите обсудить подход. CI гоняется, но смёрджить нельзя.
- **Один PR — одна мысль.** Рефактор и фича в одном PR мешают ревью; разделяйте.
- **Ревью — про код, не про автора.** Комментарии к строкам, а не «ты неправильно».

---

## Типичные ошибки модуля 13

- ❌ Внедрять тяжёлый **Git Flow в маленькой команде с непрерывным деплоем**. Два
  вечных ветка + release/hotfix-обвязка дают сложность, которую CD-команде нести незачем.
- ❌ **Гигантские PR** на 2000 строк. Их не ревьюят — их «апрувят». Дробите.
- ❌ **Ветки, живущие неделями.** Чем дольше ветка в отрыве от `main`, тем больнее
  слияние. Интегрируйтесь часто (trunk-based доводит это до предела).
- ❌ Забыть **back-merge хотфикса в develop/main** → фикс «воскресает» как баг в
  следующем релизе.
- ❌ Произвольные сообщения коммитов при включённом авто-CHANGELOG — генератор просто
  пропустит их или соберёт мусор.
- ❌ Считать «договорились не пушить в main» процессом. Без **branch protection** это не
  процесс, а надежда.
- ❌ Путать аннотированный (`-a`) и лёгкий тег для релиза. Релизы — всегда `-a`.

---

## Чек-лист модуля 13

- [ ] Могу **аргументированно выбрать workflow** под размер команды и темп релизов.
- [ ] Объясняю плюсы/минусы GitHub Flow, trunk-based, release-веток и Git Flow.
- [ ] Знаю формат **Conventional Commits** и как тип коммита влияет на **semver**.
- [ ] Связываю **теги с релизами** (`git tag -a` → push → CI Release).
- [ ] Понимаю роль **branch protection**, **CODEOWNERS** и шаблона PR в дисциплине команды.
- [ ] Умею получить CHANGELOG из истории (вручную через `git log` или авто-инструментом).

---

## Шпаргалка команд модуля 13

```bash
# --- GitHub Flow ---
git checkout -b feat/short-thing        # короткая фиче-ветка от main
git commit -m "feat(scope): ..."        # 1–2 коммита по Conventional Commits
git push -u origin feat/short-thing     # → открыть PR
git checkout main && git merge --no-ff feat/short-thing
git branch -d feat/short-thing          # удалить ветку после merge

# --- Git Flow: релиз ---
git checkout -b release/1.1 develop
git checkout main && git merge --no-ff release/1.1
git tag -a v1.1.0 -m "Release v1.1.0"
git checkout develop && git merge --no-ff release/1.1   # back-merge!

# --- Git Flow: хотфикс (от main!) ---
git checkout -b hotfix/1.0.1 main
git commit -m "fix(scope): ..."
git checkout main && git merge --no-ff hotfix/1.0.1
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git checkout develop && git merge --no-ff hotfix/1.0.1  # back-merge!

# --- Теги и релизы ---
git tag -a vX.Y.Z -m "Release vX.Y.Z"   # аннотированный тег = релиз
git tag -n                              # список тегов с сообщениями
git show vX.Y.Z --no-patch              # метаданные тега + коммит
git push origin vX.Y.Z                  # запушить один тег
git push --follow-tags                  # коммиты + аннотированные теги

# --- Просмотр истории под стратегии ---
git log --oneline --graph --all --decorate          # весь граф
git log --oneline --graph --first-parent main       # только релизные точки main

# --- CHANGELOG из истории ---
git log v1.0.0..HEAD --no-merges --pretty=format:"%s (%h)"   # поток conventional
npx standard-version                    # авто-бамп версии + CHANGELOG + тег
```

---

## Домашнее задание

> Живой пример выше сравнивал **GitHub Flow и Git Flow** на сценарии «релиз + хотфикс».
> В ДЗ — **другой** сценарий и другая стратегия: **trunk-based development**. Те же
> навыки (выбор стратегии, конвенции коммитов, защита/CI, CHANGELOG), но без повтора.

**Легенда.** Команда из **3 человек**, веб-сервис, **деплой каждый день**. Вам нужно
внедрить **trunk-based development**: короткоживущие ветки (< 1 дня) или прямые коммиты в
trunk, незрелый код прячется за **feature flag**, релизы — тегами по semver.

Работайте на **отдельном клоне**, не трогая основной репозиторий:

```bash
git clone /home/xopycaku/Projects/YT/git-zero-to-hero/taskflow /tmp/taskflow-hw11
cd /tmp/taskflow-hw11
git config user.name "Ваше Имя"
git config user.email "you@example.com"
```

### Шаги

1. **Обоснование выбора (письменно).** Создайте `docs/workflow-decision.md` и в 5–8
   предложениях обоснуйте, почему для команды из 3 человек с ежедневным деплоем
   **trunk-based** подходит лучше Git Flow. Упомяните стоимость долгоживущих веток и
   требования к тестам/CI.

2. **Настройте trunk-based ветвление.** Сделайте 2–3 коротких изменения в `taskflow`,
   каждое — отдельной веткой, которая живёт «один сеанс»:
   - заведите ветку `tb/<краткое-имя>` от `main`;
   - один-два коммита **строго по Conventional Commits** (`feat:`, `fix:`, `refactor:`);
   - влейте обратно в `main` (можно `git merge --ff-only` после `rebase`, чтобы получить
     линейную историю — это характерно для trunk-based) и удалите ветку.

3. **Feature flag.** Одну из фич спрячьте за флаг (например, переменная/константа
   `FEATURE_SORT = false` в коде), чтобы код был в trunk, но не активен. В сообщении
   коммита отразите это (`feat(tasks): add sortByTitle behind FEATURE_SORT flag`).

4. **Conventional Commits → CHANGELOG.** Поставьте релизный тег `v1.0.0` на стартовый
   `main`, сделайте свои коммиты, затем **сгенерируйте `CHANGELOG.md`** из conventional-
   коммитов. Можно инструментом (`npx standard-version`) **или** вручную из `git log`,
   сгруппировав по типам в разделы `### Features` и `### Bug Fixes`. Поставьте тег
   следующей версии по semver (если есть `feat` → `v1.1.0`, только `fix` → `v1.0.1`).

5. **CODEOWNERS + шаблон PR.** Добавьте `.github/CODEOWNERS` (хотя бы глобальный владелец
   `*` + один путь, например `/src/state/`) и `.github/pull_request_template.md` с
   чек-листом (формат заголовка по Conventional Commits, тесты, размер PR). Закоммитьте
   их как `chore(repo): add CODEOWNERS and PR template`.

6. **Защита веток (письменно).** В тот же `docs/workflow-decision.md` добавьте короткий
   раздел «Branch protection»: какие 3–4 правила вы бы включили на GitHub для `main` и
   почему именно они уместны для trunk-based (подсказка: обязательный зелёный CI здесь
   критичнее, чем число аппрувов).

### Критерии «сделано»

- [ ] `docs/workflow-decision.md` существует, содержит обоснование trunk-based и раздел
      про branch protection.
- [ ] `git log --oneline --graph --all` показывает 2–3 короткие ветки, влитые в `main`;
      история **линейная или почти линейная** (минимум переплетений — это и есть цель).
- [ ] Все ваши коммиты — валидные **Conventional Commits** (проверьте `git log --oneline`).
- [ ] В коде есть **feature flag**, и соответствующий коммит это отражает.
- [ ] Есть `CHANGELOG.md` с разделами по типам и записями для ваших `feat`/`fix`.
- [ ] Тег следующей версии стоит и согласован с semver (`git tag -n` показывает его).
- [ ] Есть `.github/CODEOWNERS` и `.github/pull_request_template.md`.

### Подсказки

- Линейная история без merge-коммитов: перед вливанием делайте
  `git checkout main && git merge --ff-only tb/<имя>` (а если main ушёл вперёд —
  сначала `git rebase main` в ветке). Это типичный «trunk-based» вид графа.
- CHANGELOG вручную: `git log v1.0.0..HEAD --no-merges --pretty=format:"* %s (%h)"`,
  затем разнесите строки `feat:` и `fix:` по разделам.
- Feature flag не обязан быть «настоящим» — достаточно `const FEATURE_SORT = false;`
  и ветки `if (FEATURE_SORT) { ... }`. Идея в том, что **код в trunk, но выключен**.
- Semver: только `fix` → бамп PATCH; есть хотя бы один `feat` → бамп MINOR; `feat!`
  или `BREAKING CHANGE:` → MAJOR.

### Самопроверка

1. Почему для команды из 3 человек с ежедневным деплоем долгоживущие ветки опаснее, чем
   для команды на квартальных релизах? (Ответ: частота интеграции и накопление конфликтов.)
2. Зачем нужен feature flag, если код всё равно в trunk? (Ответ: позволяет мёрджить
   незрелый код, не активируя его в проде, — и не держать долгую ветку.)
3. Какой тег вы поставили и почему именно такой по semver — что в ваших коммитах это
   определило (`feat` или `fix`)?
4. В trunk-based, что важнее в branch protection — число аппрувов или обязательный
   зелёный CI? Обоснуйте.
