# Модуль 10. Про-инструментарий

> **Цель модуля.** Освоить инструменты сеньора: **автоматизацию** (хуки и
> JS-экосистема), **производительность** больших репозиториев, **безопасность**
> (подпись коммитов, чистка истории) и **внутренности** Git (plumbing vs porcelain).
> К концу модуля вы настраиваете хуки, умеете ускорить клонирование монорепо,
> безопасно переписываете историю целиком и читаете объекты Git «руками».

Этот документ — пошаговый разбор «живых примеров» модуля 10 на проекте `taskflow`.

Многие инструменты этого модуля **намеренно разрушительны или глобальны**:
`git filter-repo` переписывает **всю** историю, shallow/partial clone меняют то, что
вообще скачивается, хуки и worktrees заводят дополнительные служебные файлы и папки.
Делать такое в рабочем репозитории рискованно — поэтому здесь мы работаем в
**клоне-песочнице** (throwaway-клон):

```bash
git clone /home/xopycaku/Projects/YT/git-zero-to-hero/taskflow /tmp/taskflow-m10
cd /tmp/taskflow-m10
git config user.name "itbali"
git config user.email "xopycaku@gmail.com"
```

> **Что такое throwaway-клон и зачем он.** `git clone` делает **полную независимую копию**
> репозитория в отдельной папке (здесь — в `/tmp`, которую система сама чистит). Любые
> эксперименты в ней **никак не задевают** ваш настоящий `taskflow` и его `origin`:
> «сломали» — просто `rm -rf` папку и склонируйте заново.
>
> Когда он оправдан (в отличие от модулей 7–8, где мы спокойно работали в фиче-ветке
> прямо в своём репо):
> - операция **переписывает всю историю** (`filter-repo`, вычистка секрета) — откатить
>   такое в рабочем репо тяжело;
> - вы пробуете **режимы клонирования** (`--depth`, `--filter`, sparse-checkout) — их
>   смысл виден только на свежем клоне;
> - хочется «**поиграть и выбросить**», не оставляя следов (лишние хуки, worktrees, теги).
>
> Правило: рутину (ветки, коммиты, rebase своей ветки) делают **в своём репозитории**;
> глобальную/разрушительную хирургию и эксперименты с клонированием — **в throwaway-клоне**.

Все выводы ниже — **настоящие**, снятые в этой песочнице на Git `2.43.0`. У вас будут
отличаться только хеши (SHA-1) — это норма. Там, где инструмент требует установки
пакетов или ключей (Husky, commitlint, GPG/SSH-подпись, `git filter-repo`), приведены
реальные конфиги и **честно помеченные** «примеры вывода».

---

## Мысленная модель (прочитать до команд)

Четыре идеи, на которых держится весь «про-инструментарий»:

1. **Хук — это просто исполняемый файл.** В `.git/hooks/` лежат скрипты с
   зарезервированными именами (`pre-commit`, `commit-msg`, `pre-push`, …). Git
   запускает их в нужный момент; **ненулевой код возврата отменяет операцию.**
   Husky/lint-staged/commitlint — это лишь удобная обёртка над теми же хуками,
   которую можно хранить в репозитории и ставить через `npm`.

2. **Переписать историю = создать новые коммиты.** Коммит неизменяем (хеш = функция
   содержимого). «Удалить файл из истории» физически означает **пересоздать все
   коммиты** с новыми хешами. Поэтому это всегда `force-push` и всегда требует
   предупреждения команде и бэкапа.

3. **Большой репозиторий — это про объём передачи и распаковки.** Ускорение — это
   три рычага: **меньше истории** (`--depth`, shallow), **меньше содержимого**
   (`--filter=blob:none`, partial clone — качаем blob'ы по требованию) и **меньше
   файлов в рабочем дереве** (`sparse-checkout`).

4. **Porcelain поверх plumbing.** Команды, которые вы знаете (`add`, `commit`,
   `log`) — это «фарфор» (porcelain) для людей. Под ними — «сантехника» (plumbing):
   `cat-file`, `hash-object`, `rev-parse`, `ls-tree`. Понимание plumbing — это и есть
   разница между «заучил команды» и «понимаю, что происходит».

   ```
   porcelain (для людей)   →   plumbing (для машин/понимания)
   git add / commit / log       hash-object / cat-file / rev-parse / ls-tree
   ```

---

# Раздел A. Хуки и JS-экосистема

## Шаг 1. Нативный хук `pre-commit` (без всяких пакетов)

Сначала покажем «голый» механизм, чтобы было видно: магии нет. Создадим
`pre-commit`, который **блокирует коммит**, если в добавленных `.ts/.tsx` файлах
встретился `console.log`.

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
# нативный pre-commit: блокируем коммит, если в индексе есть console.log
if git diff --cached --name-only -- '*.ts' '*.tsx' | xargs -r grep -nH 'console\.log' ; then
  echo "pre-commit: найден console.log в изменениях — коммит отклонён" >&2
  exit 1
fi
exit 0
EOF
chmod +x .git/hooks/pre-commit
```

**Что важно:**
- Файл должен называться **ровно** `pre-commit` (без расширения) и быть **исполняемым**
  (`chmod +x`). Не исполняемый хук Git молча проигнорирует.
- `git diff --cached --name-only` — список **только staged** файлов: проверяем то, что
  реально попадёт в коммит, а не весь рабочий каталог.
- `exit 1` отменяет коммит, `exit 0` — разрешает.

Теперь спровоцируем отказ:

```bash
printf 'export const dbg = () => {\n  console.log("debug");\n};\n' > src/utils/debug.ts
git add src/utils/debug.ts
git commit -m "feat: add debug helper"
```

**Реальный вывод (коммит ОТКЛОНЁН):**

```
src/utils/debug.ts:2:  console.log("debug");
pre-commit: найден console.log в изменениях — коммит отклонён
```

```bash
echo $?    # 1
```

**Объяснение построчно:**
- Первая строка — это `grep -nH`: `файл:строка:содержимое`. Хук нашёл нарушение.
- Вторая строка — наше сообщение в `stderr`.
- Код возврата `1` → Git **не создал коммит**. Проверьте `git log` — нового коммита нет.

Исправляем и коммитим снова:

```bash
printf 'export const dbg = () => {\n  return "debug";\n};\n' > src/utils/debug.ts
git add src/utils/debug.ts
git commit -m "feat: add debug helper"
```

**Реальный вывод (коммит ПРОШЁЛ):**

```
[main 296f850] feat: add debug helper
 1 file changed, 3 insertions(+)
 create mode 100644 src/utils/debug.ts
```

> 💡 Нативные хуки лежат в `.git/hooks/` и **не версионируются** (папка `.git/` не
> коммитится). Значит, у коллег их не будет. Именно эту проблему решает Husky —
> хранит хуки в репозитории.

---

## Шаг 2. Husky + lint-staged + commitlint на taskflow

Это «командное» решение: хуки лежат в репозитории, ставятся автоматически при
`npm install`. Требуется установка npm-пакетов, поэтому ниже — **реальные конфиги**,
а выводы помечены как **пример вывода**.

### 2.1. Установка

```bash
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

`npx husky init` создаёт папку `.husky/`, добавляет в `package.json` скрипт
`"prepare": "husky"` (он запускается после `npm install` и активирует хуки) и кладёт
заготовку `.husky/pre-commit`.

**Пример вывода `npx husky init`:**

```
husky - Git hooks installed
husky - created .husky/pre-commit
```

### 2.2. `package.json` (релевантные фрагменты — реальный конфиг)

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

- `lint-staged` запускает линтер/форматтер **только на staged-файлах** — это ключ к
  скорости: не на всём проекте, а на том, что коммитим.

### 2.3. `.husky/pre-commit` (реальный файл)

```sh
npx lint-staged && npm test
```

- `lint-staged` чинит стиль; `npm test` гоняет vitest. Любая ненулевая команда (`&&`)
  оборвёт цепочку и отменит коммит. **Это и есть «блокируем коммит с падающими тестами».**

### 2.4. `.husky/commit-msg` (реальный файл)

```sh
npx --no-install commitlint --edit "$1"
```

- `$1` — путь к временному файлу с сообщением коммита (Git передаёт его в `commit-msg`).
- commitlint проверит сообщение по правилам Conventional Commits.

### 2.5. `commitlint.config.cjs` (реальный конфиг)

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

### 2.6. Как это выглядит в работе (пример вывода)

Коммит с **плохим** сообщением:

```bash
git commit -m "fixed stuff"
```

**Пример вывода (коммит отклонён commitlint):**

```
⧗   input: fixed stuff
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]

✖   found 2 problems, 0 warnings
ⓘ   Get help: https://github.com/conventional-changelog/commitlint/#what-is-commitlint

husky - commit-msg script failed (code 1)
```

Коммит с **правильным** сообщением (`feat: ...`, `fix: ...`, `chore: ...`) пройдёт.

> ⚠️ Husky-хуки должны быть **быстрыми**. `npm test` в `pre-commit` оправдан на
> маленьком проекте; на большом тяжёлые проверки переносят в `pre-push` или в CI,
> а в `pre-commit` оставляют только `lint-staged`. Хук, тормозящий коммит на минуты,
> команда быстро начнёт обходить через `--no-verify`.

---

# Раздел B. rerere — «запомни, как я разрулил конфликт»

`rerere` = **re**use **re**corded **re**solution. Git запоминает, как вы разрешили
конкретный конфликт, и при **повторном** таком же конфликте применяет решение
автоматически. Незаменим при долгих rebase и регулярных слияниях длинных веток.

## Шаг 3. Включаем и записываем решение

```bash
git config rerere.enabled true
```

**Готовим воспроизводимый конфликт.** Базовый файл, затем две ветки меняют одну строку:

```bash
printf 'export const VERSION = "1.0.0";\n' > src/version.ts
git add src/version.ts && git commit -m "chore: add version 1.0.0"

git checkout -b feature-a
printf 'export const VERSION = "1.0.0-alpha";\n' > src/version.ts
git commit -am "feat: bump to alpha"

git checkout main && git checkout -b feature-b
printf 'export const VERSION = "1.0.0-beta";\n' > src/version.ts
git commit -am "feat: bump to beta"
```

Первое слияние — **конфликт**, rerere его записывает:

```bash
git merge feature-a
```

**Реальный вывод:**

```
Auto-merging src/version.ts
CONFLICT (content): Merge conflict in src/version.ts
Recorded preimage for 'src/version.ts'
Automatic merge failed; fix conflicts and then commit the result.
```

- Строка `Recorded preimage ...` — rerere **запомнил «как выглядел конфликт»** (preimage).

Разрешаем вручную (выбрали компромисс `1.0.0-rc`) и коммитим:

```bash
printf 'export const VERSION = "1.0.0-rc";\n' > src/version.ts
git add src/version.ts
git commit --no-edit
```

**Реальный вывод при коммите:**

```
Recorded resolution for 'src/version.ts'.
```

- Теперь rerere запомнил **и решение** (postimage). Кэш лежит в `.git/rr-cache/`:

```bash
ls .git/rr-cache
# e7b67b7222e5b0b9d44e1e6cf0ad89c502ff0e8c   <- каталог с preimage/postimage
```

## Шаг 4. Повторяем конфликт — rerere решает сам

Откатим слияние и повторим его — будто мы делаем rebase ещё раз:

```bash
git reset --hard HEAD~1
git merge feature-a
```

**Реальный вывод:**

```
Auto-merging src/version.ts
CONFLICT (content): Merge conflict in src/version.ts
Resolved 'src/version.ts' using previous resolution.
Automatic merge failed; fix conflicts and then commit the result.
```

- Ключевая строка: **`Resolved ... using previous resolution.`** rerere сам наложил
  ваше прошлое решение. Конфликтных маркеров в файле нет:

```bash
cat src/version.ts          # export const VERSION = "1.0.0-rc";
git diff --check            # пусто, код возврата 0 — маркеров конфликта нет
```

Вам остаётся лишь `git add` + `git commit` — руками разруливать второй раз не нужно.

> 💡 `rerere` лучше включить **глобально**: `git config --global rerere.enabled true`.
> Это безопасно: он лишь предлагает прошлые решения, ничего не ломает.

---

# Раздел C. Worktrees — несколько рабочих деревьев на один репозиторий

Вместо `git stash` + переключения веток (теряется состояние, пересобирается
`node_modules`) можно иметь **второй рабочий каталог**, привязанный к той же базе
объектов, но на другой ветке.

## Шаг 5. Создаём, работаем, удаляем

```bash
git checkout main
git worktree add ../wt-feature -b feature/quick-fix
```

**Реальный вывод:**

```
Preparing worktree (new branch 'feature/quick-fix')
HEAD is now at 4552a7e chore: add version 1.0.0
```

- `../wt-feature` — путь нового рабочего дерева; `-b feature/quick-fix` — сразу создаём
  под него ветку.

```bash
git worktree list
```

**Реальный вывод:**

```
/tmp/taskflow-m10  4552a7e [main]
/tmp/wt-feature   4552a7e [feature/quick-fix]
```

Работаем во втором дереве **параллельно**, не трогая основное:

```bash
cd /tmp/wt-feature
git branch --show-current        # feature/quick-fix
printf 'export const PATCH = true;\n' > src/patch.ts
git add src/patch.ts && git commit -m "feat: patch in worktree"
```

Вернувшись в основное дерево, видим, что ветка `feature/quick-fix` уже продвинулась:

```bash
cd /tmp/taskflow-m10
git worktree list
```

**Реальный вывод:**

```
/tmp/taskflow-m10  4552a7e [main]
/tmp/wt-feature   91af2d6 [feature/quick-fix]
```

Закончили — удаляем дерево (ветка остаётся):

```bash
git worktree remove ../wt-feature
git worktree list
```

**Реальный вывод:**

```
/tmp/taskflow-m10  4552a7e [main]
```

**Зачем это нужно:** срочный hotfix во время большой задачи, сборка одной ветки при
работе над другой, ревью чужого PR без `stash`. Объектная база — **одна** (общий
`.git/`), так что это дёшево по диску.

> ⚠️ Одну и ту же ветку нельзя одновременно держать в двух worktree — Git это
> запретит. Каждое дерево «владеет» своей веткой.

---

# Раздел D. Submodules vs subtree (когда что)

Иногда нужно встроить **чужой репозиторий** внутрь своего. Есть два механизма.

## Submodule

```bash
git submodule add https://example.com/ui-kit.git vendor/ui-kit
git commit -m "chore: add ui-kit submodule"
# у того, кто клонирует:
git clone --recurse-submodules <url>
# или после обычного clone:
git submodule update --init --recursive
```

- Submodule — это **указатель на конкретный коммит** другого репо. В вашем дереве
  `vendor/ui-kit` — отдельный `.git`, а в индексе хранится строка `gitlink` с хешем.
- **Плюс:** чёткая фиксация версии, история подмодуля отдельна и чиста.
- **Минус:** все должны помнить про `--recurse-submodules`; забыли — получили пустую
  папку. Обновление двухступенчатое (зайти в подмодуль, потом закоммитить новый указатель).

Проверить, что подмодуль — это gitlink, можно plumbing'ом:

```bash
git ls-tree HEAD vendor/ui-kit
# 160000 commit <hash>   vendor/ui-kit     <- режим 160000 = gitlink (а не tree!)
```

## Subtree

```bash
git subtree add  --prefix=vendor/ui-kit https://example.com/ui-kit.git main --squash
git subtree pull --prefix=vendor/ui-kit https://example.com/ui-kit.git main --squash
```

- Subtree **вкомпоновывает файлы прямо в вашу историю**. Клонирующему не нужно ничего
  знать — это обычные файлы.
- **Плюс:** прозрачно для пользователей, один `git clone` — и всё на месте.
- **Минус:** история чужого кода смешивается с вашей; обратная отдача изменений
  (`git subtree push`) сложнее.

> ⚠️ **Типичная ошибка:** тащить submodule/subtree там, где хватило бы обычной
> зависимости через пакетный менеджер (npm/pip/cargo). Встраивание репозитория
> оправдано, когда нужно **редактировать** чужой код вместе со своим или когда
> пакета просто нет. Иначе — `npm install` проще для всех.

| | Submodule | Subtree | npm-пакет |
|---|---|---|---|
| Файлы в вашем дереве | ссылка (gitlink) | реальные файлы | в `node_modules` |
| Нужен спец. clone | да (`--recurse`) | нет | нет |
| Фиксация версии | по коммиту | по коммиту/squash | по semver/lock |
| Когда выбирать | строгая версия, отдельная история | прозрачность для всех | обычная зависимость |

---

# Раздел E. Производительность монорепо

Три рычага: меньше истории, меньше содержимого, меньше файлов в рабочем дереве.

## Шаг 6. Shallow clone (`--depth`) — меньше истории

```bash
git clone --depth 1 file:///tmp/taskflow-m10 /tmp/tf-shallow
```

**Реальный вывод:**

```
Cloning into '/tmp/tf-shallow'...
```

```bash
cd /tmp/tf-shallow
git log --oneline | wc -l     # 1  — виден только последний коммит
cat .git/shallow              # 4552a7e...  — граница «обрезки» истории
```

- `--depth 1` качает **только последний коммит**. Идеально для CI: история не нужна,
  важно только текущее состояние. Файл `.git/shallow` помечает «дальше истории нет».
- Углубить позже: `git fetch --unshallow` (дотянуть всё) или `--depth N`.

## Шаг 7. Partial clone (`--filter=blob:none`) — меньше содержимого

```bash
git clone --filter=blob:none <url> /tmp/tf-partial
```

- Качаются **все коммиты и tree'ы, но не blob'ы** (содержимое файлов). Blob'ы
  подтягиваются **по требованию**, когда вы реально открываете файл/делаете checkout.
  В отличие от shallow, **вся история доступна** — удобно для `git log`/`blame`.

```bash
cd /tmp/tf-partial
git config remote.origin.promisor          # true
git config remote.origin.partialclonefilter # blob:none
```

> 💡 В нашей песочнице сервером выступает локальный путь, который может не поддерживать
> фильтрацию (`warning: filtering not recognized by server, ignoring`). На реальных
> хостингах (GitHub/GitLab) фильтр работает. Конфиг `promisor=true` всё равно
> прописывается — репозиторий помечен как «частичный».

## Шаг 8. Sparse-checkout — меньше файлов в рабочем дереве

Выкачиваем историю, но **разворачиваем на диск только нужные папки** — спасение в
монорепо на тысячи каталогов.

```bash
git clone --no-checkout --filter=blob:none <url> /tmp/tf-sparse
cd /tmp/tf-sparse
git sparse-checkout init --cone
git sparse-checkout set src/utils
git checkout
```

**Реальный результат — в рабочем дереве только корень + `src/utils`:**

```bash
ls          # index.html  package.json  README.md  src  tsconfig.json  vite.config.ts ...
ls src      # App.tsx  main.tsx  utils  version.ts
```

- `--cone` — «конусный» режим: быстрый, оперирует **каталогами** (а не произвольными
  шаблонами). `set src/utils` — оставить на диске только этот путь (плюс файлы в корне).
- Объекты в `.git/` остаются полные — вы можете в любой момент `git sparse-checkout add`
  ещё каталог. Меняется только то, что развёрнуто на диск.

## Шаг 9. `git maintenance` — фоновое обслуживание

```bash
git maintenance register      # включить периодическое обслуживание для репо
git maintenance run --task=gc # запустить задачу вручную
git maintenance unregister    # отключить
```

- `git maintenance` — современная замена ручному `git gc`: умеет ставить расписание
  (cron/launchd/systemd) и держать репозиторий «в форме» (упаковка, prefetch, коммит-граф),
  не блокируя вашу работу. Все три команды выше отработали в песочнице с кодом `0`.

---

# Раздел F. Чистка истории — `git filter-repo`

Задача: **полностью удалить** из истории секрет или большой файл. Это **переписывание
всей истории** → новые хеши у всех коммитов → обязательный `force-push` и предупреждение
команде.

> ⚠️ **Перед чисткой — ОБЯЗАТЕЛЬНО:** (1) сделайте бэкап (`git clone --mirror`),
> (2) предупредите команду (после force-push все должны переклонировать репо или
> аккуратно ребейзнуть свои ветки), (3) **смените сам секрет** (ротация ключа) —
> удаление из истории не отменяет того, что секрет уже утёк.

## Шаг 10. Рекомендуемый путь — `git filter-repo`

`git filter-repo` — официально рекомендуемый инструмент (быстрый, безопасный),
**но это отдельный пакет** (`pip install git-filter-repo`). Проверьте наличие:

```bash
git filter-repo --version
```

В нашей песочнице он **НЕ установлен** (реальный вывод):

```
git: 'filter-repo' is not a git command. See 'git --help'.
```

Так выглядела бы команда и **пример вывода** (помечено как пример):

```bash
# удалить файл из всей истории всех веток
git filter-repo --path secret.txt --invert-paths
```

**Пример вывода (filter-repo установлен):**

```
Parsed 5 commits
New history written in 0.07 seconds; now repacking/cleaning...
...
Completely finished after 0.34 seconds.
```

`filter-repo` после себя сам чистит refs и запускает упаковку — отдельный `gc` не нужен.
Аналогично удаляют большой файл (`--path huge.bin --invert-paths`) или маскируют строки
(`--replace-text patterns.txt`).

## Шаг 11. Что доступно «из коробки» — `git filter-branch` (реальный прогон)

Когда `filter-repo` нет, в Git есть встроенный `filter-branch`. Он **медленнее и
капризнее** (поэтому Git сам предупреждает и рекомендует `filter-repo`), но работает.
Покажем **реальное удаление** случайно закоммиченного `secret.txt` в отдельной копии:

```bash
git clone /tmp/taskflow-m10 /tmp/taskflow-secret
cd /tmp/taskflow-secret
# имитируем «беду»: коммитим секрет, затем ещё пару коммитов сверху
printf 'AWS_SECRET_ACCESS_KEY=...EXAMPLEKEY\n' > secret.txt
git add secret.txt && git commit -m "wip: add config"
# ... ещё коммиты, секрет «закопан» в истории
```

Удаляем его из **всей** истории:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch secret.txt' \
  --prune-empty --tag-name-filter cat -- --all
```

**Реальный вывод (хвост):**

```
Rewrite ad643ca... (8/9)  rm 'secret.txt'
Rewrite 525ab50... (9/9)  rm 'secret.txt'

Ref 'refs/heads/main' was rewritten
WARNING: Ref 'refs/remotes/origin/main' is unchanged
```

**Объяснение флагов:**
- `--index-filter '...'` — для каждого коммита выполнить команду над **индексом**
  (быстрее, чем `--tree-filter`). `git rm --cached --ignore-unmatch` убирает файл из
  индекса, не падая на коммитах, где его ещё не было.
- `--prune-empty` — удалить коммиты, которые после чистки стали пустыми.
- `-- --all` — применить ко **всем** веткам и тегам.
- `WARNING: ... origin/* is unchanged` — **важно:** remote-tracking refs (`origin/*`)
  не переписываются; их надо удалить отдельно, иначе старый blob остаётся достижим.

Зачищаем «хвосты» и физически выбрасываем объект:

```bash
rm -rf .git/refs/original/                 # бэкап-refs, что оставил filter-branch
git remote remove origin                   # убрать remote-tracking refs на секрет
git reflog expire --expire=now --all       # обнулить reflog (он тоже держит объекты)
git gc --prune=now                         # упаковать и удалить недостижимые объекты
```

**Проверяем, что секрета больше нет нигде (реальный вывод):**

```bash
git log --oneline --all -- secret.txt      # (пусто — файла в истории нет)
git grep -I "AWS_SECRET" $(git rev-list --all)
echo $?                                     # 1 — строка не найдена ни в одном коммите
```

## Альтернативы

- **BFG Repo-Cleaner** — отдельный jar, очень быстрый на «удалить большие файлы /
  заменить строки». Удобный синтаксис (`bfg --delete-files huge.bin`,
  `bfg --replace-text passwords.txt`), но не такой гибкий, как `filter-repo`.
- **`git filter-branch`** — встроен, но устаревший и медленный; годится как запасной
  вариант (что мы и показали выше).

После чистки — обязательный `git push --force-with-lease` во все ветки и сообщение
команде «переклонируйте репозиторий».

---

# Раздел G. Подпись коммитов (verified-бейдж)

Подпись доказывает: коммит сделали **именно вы**, а не кто-то, кто вписал ваш e-mail в
`user.email` (что может любой!). На GitHub/GitLab подписанные коммиты получают бейдж
**Verified**. Требуется ключ (GPG **или** SSH), поэтому ниже — реальные конфиги,
выводы помечены как **пример**.

## Вариант 1. SSH-подпись (проще, если у вас уже есть SSH-ключ)

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true          # подписывать все коммиты
```

В песочнице мы проверили, что Git принимает такой конфиг (реальный вывод):

```bash
git config gpg.format ssh    # записалось без ошибок
```

Чтобы подпись стала **Verified** на хостинге, тот же публичный ключ надо добавить в
профиль как **Signing Key** (отдельно от Authentication Key).

## Вариант 2. GPG-подпись (в песочнице есть `gpg (GnuPG) 2.4.4`)

```bash
gpg --full-generate-key                          # создать ключ (RSA 4096 / ed25519)
gpg --list-secret-keys --keyid-format=long       # узнать ID ключа
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
```

## Подписать и проверить

```bash
git commit -S -m "feat: signed commit"           # -S = подписать (если не включён auto)
git log --show-signature -1
git verify-commit HEAD                            # проверить подпись отдельно
```

**Пример вывода `git log --show-signature -1`:**

```
commit 9f3c1a2... (HEAD -> main)
gpg: Signature made Sat 20 Jun 2026 18:40:00 +0100
gpg:                using RSA key 1A2B3C4D...
gpg: Good signature from "itbali <xopycaku@gmail.com>" [ultimate]
Author: itbali <xopycaku@gmail.com>
    feat: signed commit
```

- `Good signature from ...` — подпись валидна. На GitHub это даст бейдж **Verified**.

> 💡 `git verify-commit` существует и в нашей среде (реальный вывод
> `usage: git verify-commit ...`). Сама проверка требует, чтобы публичный ключ был
> известен локально или зарегистрирован на хостинге.

---

# Раздел H. Внутренности: plumbing vs porcelain

«Вскроем» объекты Git руками — это закрепляет всю объектную модель из модуля 0 и даёт
понимание, что porcelain-команды лишь обёртки.

## Шаг 12. Читаем коммит и дерево

```bash
git cat-file -t HEAD        # тип объекта
git cat-file -p HEAD        # содержимое
```

**Реальный вывод:**

```
commit
```
```
tree 4db2c5e24820f63662ace0173b2ab677e52ab0fd
parent 296f8509a5013ac7f25919224a9adaa128320807
author itbali <xopycaku@gmail.com> 1781977029 +0100
committer itbali <xopycaku@gmail.com> 1781977029 +0100

chore: add version 1.0.0
```

- `tree ...` — ссылка на корневой снимок; `parent ...` — ссылка на предыдущий коммит
  (из этих ссылок и складывается граф). Это ровно те поля, что мы разбирали в модуле 0.

```bash
git ls-tree HEAD
```

**Реальный вывод (фрагмент):**

```
100644 blob bdc7d326...  .gitattributes
040000 tree 87b5b174...  docs
040000 tree 53f1681e...  src
100644 blob 9544b62a...  package.json
```

- `режим тип хеш имя`. `100644` — обычный файл (blob), `040000` — каталог (tree),
  `160000` — gitlink (submodule).

## Шаг 13. Хеш = содержимое (доказательство)

```bash
git rev-parse HEAD:src/version.ts    # хеш blob'а файла В коммите
git hash-object src/version.ts       # хеш ОТ содержимого файла на диске
```

**Реальный вывод (хеши совпадают):**

```
aa2575bab818467860fa7c445d1d5112a2849ced
aa2575bab818467860fa7c445d1d5112a2849ced
```

- Совпадение доказывает: Git адресует объекты **по содержимому**. Тот же контент → тот
  же SHA-1 → один объект в базе. `rev-parse` ещё и резолвит любые ревизии:
  `git rev-parse HEAD`, `git rev-parse --short HEAD`, `git rev-parse main~2`.

## Шаг 14. Packfiles и `git gc`

Свежие («loose») объекты лежат по одному файлу. `git gc` упаковывает их в **packfile**
с дельта-сжатием.

```bash
git count-objects -v        # ДО упаковки
```

**Реальный вывод:**

```
count: 60
size: 264
in-pack: 0
packs: 0
```

```bash
git gc
git count-objects -v        # ПОСЛЕ упаковки
```

**Реальный вывод:**

```
count: 0
size: 0
in-pack: 60
packs: 2
size-pack: 37
```

```bash
ls .git/objects/pack/
# pack-373c3ff7....idx   pack-373c3ff7....pack
# pack-a0249a65....idx   pack-a0249a65....pack
```

**Объяснение:**
- `count: 60 → 0`, `in-pack: 0 → 60` — все loose-объекты переехали в packfile.
- `.pack` — сами сжатые объекты, `.idx` — индекс (быстрый поиск объекта по хешу).
- Это и есть то, что Git передаёт по сети при `clone`/`fetch` — один компактный pack,
  а не тысячи мелких файлов. Связь с разделом E: packfile + дельты — это и есть «почему
  Git экономно гоняет данные».

---

## Типичные ошибки модуля 10

- ❌ **Хуки, тормозящие коммит на минуты.** Тяжёлые проверки (полные тесты, type-check
  всего проекта) — в `pre-push`/CI, а в `pre-commit` — только `lint-staged` по
  изменённым файлам. Иначе команда начнёт обходить хуки через `--no-verify`.
- ❌ **`filter-repo`/`filter-branch` без бэкапа и предупреждения.** Это force-push и
  новые хеши у всех. Сначала `git clone --mirror` (бэкап), потом предупреждение команде,
  потом — главное — **ротация самого секрета** (удаление из истории не отменяет утечку).
- ❌ **Submodule/subtree там, где хватило бы пакета.** Если не нужно редактировать
  чужой код вместе со своим — берите зависимость через npm/pip, всем будет проще.
- ❌ **Думать, что нативные `.git/hooks` есть у коллег.** Папка `.git/` не
  версионируется; командные хуки храните через Husky.
- ❌ **Путать shallow и partial clone.** `--depth` режет **историю** (для CI),
  `--filter=blob:none` качает **содержимое по требованию** (история остаётся целой).
- ❌ **Полагаться, что `user.email` подтверждает авторство.** Его впишет кто угодно;
  доказательство — только подпись (GPG/SSH) и бейдж Verified.

---

## Чек-лист модуля 10

- [ ] Настраиваю хуки: понимаю нативные `.git/hooks/` и командные через Husky.
- [ ] Поднимаю `pre-commit` (lint-staged) и `commit-msg` (commitlint) на проекте.
- [ ] Включаю `rerere` и понимаю, как он переиспользует решение конфликта.
- [ ] Завожу второй `git worktree` для параллельной ветки.
- [ ] Знаю, как ускорить большой репо: `--depth`, `--filter=blob:none`, `sparse-checkout`.
- [ ] Различаю submodule / subtree / обычный пакет и выбираю осознанно.
- [ ] Умею **безопасно** переписать историю целиком (filter-repo/filter-branch/BFG):
      бэкап → предупреждение → ротация секрета → force-push.
- [ ] Настраиваю подпись коммитов (GPG или SSH) и понимаю бейдж Verified.
- [ ] Читаю объекты plumbing'ом: `cat-file`, `ls-tree`, `rev-parse`, `hash-object`.
- [ ] Понимаю packfiles, `git gc` и `git maintenance`.

---

## Шпаргалка команд модуля 10

```bash
# --- хуки ---
chmod +x .git/hooks/pre-commit         # нативный хук = исполняемый файл, exit!=0 = отмена
npx husky init                         # командные хуки в .husky/ (версионируются)
npx lint-staged                        # линт/формат ТОЛЬКО staged-файлов
npx commitlint --edit "$1"             # проверка сообщения (в commit-msg хуке)
git commit --no-verify                 # пропустить хуки (использовать осознанно!)

# --- rerere ---
git config --global rerere.enabled true   # запоминать решения конфликтов

# --- worktrees ---
git worktree add ../wt-feature -b feature/x   # второе дерево + новая ветка
git worktree list                             # все рабочие деревья
git worktree remove ../wt-feature             # удалить дерево (ветка остаётся)

# --- submodules / subtree ---
git submodule add <url> path                  # подмодуль (ссылка на коммит)
git submodule update --init --recursive       # развернуть после clone
git subtree add --prefix=path <url> main --squash   # вкомпоновать файлы в историю

# --- производительность ---
git clone --depth 1 <url>                     # shallow: только последний коммит
git clone --filter=blob:none <url>            # partial: blob'ы по требованию
git sparse-checkout init --cone               # включить sparse (конусный режим)
git sparse-checkout set src/utils             # развернуть на диск только этот путь
git maintenance register                      # фоновое обслуживание репо

# --- чистка истории (бэкап + предупреждение + ротация!) ---
git clone --mirror <url> backup.git           # БЭКАП перед чисткой
git filter-repo --path secret.txt --invert-paths        # рекомендуемый способ
git filter-repo --path huge.bin  --invert-paths         # удалить большой файл
# запасной встроенный путь:
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch secret.txt' --prune-empty -- --all
git push --force-with-lease --all             # после чистки

# --- подпись ---
git config --global gpg.format ssh            # подпись SSH-ключом
git config --global user.signingkey <key>
git config --global commit.gpgsign true       # подписывать все коммиты
git log --show-signature -1                   # проверить подпись
git verify-commit HEAD

# --- plumbing / внутренности ---
git cat-file -t <ref>                         # тип объекта
git cat-file -p <ref>                         # содержимое объекта
git ls-tree HEAD <path>                       # содержимое tree
git rev-parse HEAD                            # резолв ревизии в хеш
git hash-object <file>                        # хеш от содержимого файла
git count-objects -v                          # статистика хранилища
git gc                                        # упаковать объекты в packfile
```

---

## Домашнее задание

Эти задания закрепляют **навыки** модуля, но **не повторяют** живые примеры из
видео (там были: Husky-блокировка падающими тестами, удаление `secret.txt`,
подпись коммитов, второй worktree). Работайте **в копии-песочнице**:
`git clone <ваш taskflow> /tmp/hw10 && cd /tmp/hw10`.

### Задание 1. Conventional Commits через хук `commit-msg`

В отличие от примера (там был `pre-commit` с тестами), настройте **другой хук** —
`commit-msg` — и заставьте его отклонять плохие **сообщения** коммитов.

Шаги:
1. Установите `@commitlint/cli` и `@commitlint/config-conventional`, создайте
   `commitlint.config.cjs` с `extends: ['@commitlint/config-conventional']`.
2. Через Husky добавьте хук `.husky/commit-msg`, вызывающий commitlint.
3. Попробуйте закоммитить с сообщением `"updated things"` — должно быть **отклонено**.
4. Закоммитьте с `"feat: add task filter"` — должно **пройти**.

Критерии «сделано»:
- [ ] `git commit -m "updated things"` падает с ошибкой commitlint, коммит **не создан**
      (`git log` без нового коммита).
- [ ] `git commit -m "feat: add task filter"` создаёт коммит.
- [ ] Хук лежит в **версионируемой** `.husky/`, а не в `.git/hooks/`.

Подсказки: хук получает путь к файлу сообщения в `$1`; вызов —
`npx --no-install commitlint --edit "$1"`. Проверьте `echo $?` после неудачного коммита.

Самопроверка: временно отключите хук (`--no-verify`) и убедитесь, что плохое сообщение
проходит — это доказывает, что блокировал именно хук.

### Задание 2. Включить и применить `rerere`

В примере rerere не показывали в ДЗ-варианте — сделайте сами на **другом** файле.

Шаги:
1. Включите `git config rerere.enabled true`.
2. Создайте конфликт: две ветки по-разному меняют одну строку в
   `src/utils/taskUtils.ts` (например, разные реализации одной функции).
3. Слейте — получите конфликт, разрешите вручную, закоммитьте.
4. Откатите слияние (`git reset --hard HEAD~1`) и повторите его.

Критерии «сделано»:
- [ ] При первом конфликте в выводе есть `Recorded preimage` и затем
      `Recorded resolution`.
- [ ] При повторном слиянии есть строка `Resolved ... using previous resolution.`
- [ ] После повтора `git diff --check` не находит маркеров конфликта (код возврата 0).

Подсказки: каталог `.git/rr-cache/` должен появиться после первого разрешения.
Конфликт «по одной строке» получить проще всего.

Самопроверка: удалите `.git/rr-cache/` и повторите шаг 4 — теперь конфликт снова
придётся разруливать руками. Это доказывает, что автоматику давал rerere.

### Задание 3. Удалить из всей истории большой бинарник через filter-repo

В примере чистили текстовый секрет — здесь уберите **другой объект**: случайно
закоммиченный **большой бинарный файл**. Только в **песочнице-копии**!

Шаги:
1. Сделайте бэкап: `git clone --mirror /tmp/hw10 /tmp/hw10-backup.git`.
2. Создайте «тяжёлый» файл и закоммитьте его, затем сделайте ещё пару коммитов сверху:
   `head -c 5M /dev/urandom > assets/huge.bin && git add assets/huge.bin && git commit -m "wip"`.
3. Удалите его из **всей** истории. Если есть `git filter-repo` —
   `git filter-repo --path assets/huge.bin --invert-paths`. Если нет — используйте
   `git filter-branch ... --index-filter 'git rm --cached --ignore-unmatch assets/huge.bin' ...`
   (как в Шаге 11), затем `reflog expire` + `git gc --prune=now`.

Критерии «сделано»:
- [ ] `git log --oneline --all -- assets/huge.bin` пуст (файла в истории нет).
- [ ] Размер репозитория заметно упал: сравните `git count-objects -vH` (или
      `du -sh .git`) до и после.
- [ ] Бэкап `/tmp/hw10-backup.git` цел и всё ещё содержит файл (доказательство, что
      бэкап имеет смысл).

Подсказки: проверьте наличие инструмента `git filter-repo --version`. После
`filter-branch` не забудьте удалить `.git/refs/original/`, `git reflog expire
--expire=now --all` и `git gc --prune=now` — иначе объект остаётся достижим.

Самопроверка: найдите крупнейшие объекты до и после:
`git rev-list --objects --all | git cat-file --batch-check='%(objectsize) %(rest)' | sort -n | tail -5`.
До чистки `huge.bin` в топе, после — исчез.

### Задание 4 (опционально). Shallow / partial clone и sparse-checkout

Шаги:
1. `git clone --depth 1 <repo> /tmp/hw10-shallow` — проверьте `git log` (1 коммит) и
   наличие `.git/shallow`.
2. `git clone --no-checkout --filter=blob:none <repo> /tmp/hw10-sparse`, затем
   `git sparse-checkout init --cone && git sparse-checkout set src/components && git checkout`.

Критерии «сделано»:
- [ ] В shallow-клоне виден ровно один коммит.
- [ ] В sparse-клоне на диске развёрнут только `src/components` (плюс файлы в корне),
      а `src/utils`/`src/state` отсутствуют — проверьте `ls -R src`.

Подсказки: добавить ещё каталог можно `git sparse-checkout add src/state`; вернуть всё —
`git sparse-checkout disable`.

Самопроверка: `du -sh .git` у обычного и shallow-клона — у shallow меньше за счёт
обрезанной истории.
