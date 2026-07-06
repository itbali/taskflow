# Модуль 9. Точечная отмена: checkout/restore и stash

> **Цель модуля.** Уметь отменить правки **одного файла**, не трогая всю историю, и
> безопасно отложить незакоммиченную работу ради срочной задачи. К концу модуля вы
> своими словами объясняете, зачем `git restore` заменил перегруженный `git checkout`,
> и умеете прятать работу через `git stash` и возвращать её обратно.

Этот документ — пошаговый разбор «живого примера» модуля 9 на проекте `taskflow`.
Все выводы команд ниже — **настоящие**. Работаем в своём `taskflow`, на `main` — все
операции безопасны и обратимы, ничего не публикуем. Единственное, что у вас будет
отличаться, — сами хеши (SHA-1).

---

## Мысленная модель (прочитать до команд)

Три идеи, на которых держится весь модуль.

1. **`checkout` был перегружен — `switch`/`restore` разделили его смысл.** До Git
   2.23 одна команда `git checkout` делала и переключение веток
   (`git checkout <branch>`), и восстановление файлов
   (`git checkout -- <file>`, `git checkout <commit> -- <file>`). Это путало: одна и та
   же команда с разным набором аргументов делала разные вещи. С 2.23 переключение веток
   ушло в `git switch` (модуль 3), а восстановление файлов — в `git restore`.
   Старый синтаксис `checkout` никуда не делся и продолжает работать, но новый —
   однозначнее.

2. **`restore` по умолчанию трогает только working tree — в отличие от старого
   `checkout`.** Это ключевое отличие, а не просто смена названия:

   ```
   git checkout <commit> -- <file>      # working tree + index (файл сразу staged)
   git restore --source=<commit> <file> # только working tree (index не тронут)
   git restore --staged <file>          # обратное: убрать файл из index (как reset для файла)
   ```

3. **`stash` — это временный стек, а не коммит.** `git stash push` снимает
   незакоммиченные изменения (working tree + index) с рабочего дерева и кладёт их в
   отдельный стек, никак не связанный с текущей веткой. Working tree становится чистым,
   можно спокойно переключаться на другую задачу. `pop` возвращает изменения и убирает
   их из стека, `apply` — возвращает, но оставляет в стеке (на случай, если нужно
   применить то же самое ещё раз в другом месте).

---

## Шаг 1. `checkout -- <file>` и его современный аналог `restore`

Случайно оставили отладочный `console.log` в «горячем» файле
`src/utils/taskUtils.ts` — хотим просто отменить правку в working tree.

```bash
printf '\nconsole.log("debug: taskUtils loaded")\n' >> src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
```

**Вывод:**

```
 M src/utils/taskUtils.ts
```

Исторический синтаксис (работает и сейчас):

```bash
git checkout -- src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
```

`git status -s` пуст — правка отменена. Тот же результат современным `restore`:

```bash
printf '\nconsole.log("debug: taskUtils loaded")\n' >> src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
git restore src/utils/taskUtils.ts
git status -s src/utils/taskUtils.ts
```

**Вывод:**

```
 M src/utils/taskUtils.ts

```

(вторая команда `git status -s` снова пустая). Оба варианта отменяют правку **одного**
файла в working tree, не трогая остальные и не двигая ветку — в отличие от `reset`
(модуль 8), который двигает всю ветку целиком.

---

## Шаг 2. Восстановить файл из конкретного коммита — и разница в поведении index

Покажем разницу между старым и новым синтаксисом на восстановлении файла из
**произвольного** коммита, а не только из `HEAD`.

Подготовим два коммита: «безопасную» версию `getTaskById` и следующий коммит, где
поиск случайно сломали (сравнивают не по тому полю):

```bash
cat >> src/utils/taskUtils.ts <<'EOF'

/** Найти задачу по id. */
export function getTaskById(tasks: Task[], id: string): Task | undefined {
  return tasks.find((t) => t.id === id)
}
EOF
git add src/utils/taskUtils.ts && git commit -m "feat: add getTaskById helper"
git rev-parse --short HEAD
```

**Вывод:** `1740ad7`

```bash
# следующий коммит нечаянно ломает поиск — сравнивают по title, а не по id
git add src/utils/taskUtils.ts && git commit -m "refactor: tweak getTaskById lookup key"
```

Теперь восстанавливаем файл из «хорошего» коммита `1740ad7` **историческим** способом:

```bash
git checkout 1740ad7 -- src/utils/taskUtils.ts
git status -s
```

**Вывод:**

```
M  src/utils/taskUtils.ts
```

`M ` в **первой** колонке — файл сразу оказался **в индексе**, готовым к коммиту, как
будто вы его `add`-нули руками. Откатываем эксперимент и повторяем **современным**
способом:

```bash
git reset --hard HEAD   # вернули «сломанный» коммит для чистоты сравнения
git restore --source=1740ad7 src/utils/taskUtils.ts
git status -s
```

**Вывод:**

```
 M src/utils/taskUtils.ts
```

` M` во **второй** колонке — файл изменён только в working tree, index остался как был
(указывает на «сломанную» версию). Это и есть причина, по которой `restore` появился
отдельной командой: старый `checkout <commit> -- <file>` незаметно трогал ещё и index,
а `restore` по умолчанию — нет. Если нужно поведение старого `checkout` (сразу
застейджить), добавьте `--staged`: `git restore --source=1740ad7 --staged <file>`.

---

## Шаг 3. stash при срочном переключении на хотфикс

Вы посреди правок, и тут «горит» хотфикс. Коммитить полуфабрикат не хочется — прячем
работу в `stash`.

```bash
git reset --hard HEAD   # чистое состояние перед демонстрацией stash
printf '\n// TODO: подсветить совпадение поиска в TaskItem\n' >> src/components/TaskItem.tsx
git status -s
```

**Вывод:**

```
 M src/components/TaskItem.tsx
```

Прячем и проверяем, что working tree чист:

```bash
git stash push -m "wip: подсветка поиска в TaskItem"
git status -s
git stash list
```

**Вывод:**

```
Saved working directory and index state On main: wip: подсветка поиска в TaskItem
stash@{0}: On main: wip: подсветка поиска в TaskItem
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
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/components/TaskItem.tsx

no changes added to commit (use "git add" and/or "git commit -a")
Dropped refs/stash@{0} (6d4d065a8826e77018960b080b695631fab46994)
 M src/components/TaskItem.tsx
```

`pop` вернул правки в working tree и **удалил** запись из стэка. (Если хотите оставить
её в стэке — используйте `git stash apply`.)

---

## Типичные ошибки модуля 9

- ❌ **Путать `checkout <commit> -- <file>` и `restore --source=<commit> <file>`.**
  Первый незаметно застейджит файл, второй — нет. Если важно, попадёт ли файл сразу в
  index, — выбирайте команду осознанно, а не по привычке.
- ❌ **Забыть, что `stash` — общий стек на репозиторий**, а не привязан к ветке. Если
  переключиться на другую ветку и сделать `stash pop` там — Git применит изменения
  поверх **текущей** ветки, что может быть не тем, что вы хотели (см. `git stash
  branch` в домашнем задании).
- ❌ **`stash pop` при конфликте.** Если ветка убежала вперёд, `pop` может конфликтовать
  с текущими файлами — тогда стэш остаётся в списке, пока конфликт не разрешён руками.
- ❌ **Путать `restore` (файл) и `reset` (вся ветка).** `restore` — точечная операция
  над одним файлом, `reset` двигает HEAD и весь index сразу (модуль 8).

---

## Чек-лист модуля 9

- [ ] Объясняю, почему `checkout` разделили на `switch` (модуль 3) и `restore`.
- [ ] Знаю разницу в поведении index между `checkout <commit> -- <file>` и
      `restore --source=<commit> <file>`.
- [ ] Умею достать один файл из коммита через `git restore --source`.
- [ ] Прячу незаконченную работу `git stash push -m "..."` и возвращаю `pop`/`apply`.
- [ ] Понимаю разницу `pop` (возврат + удаление из стека) и `apply` (возврат, стек
      остаётся).

---

## Шпаргалка команд модуля 9

```bash
# отмена правок одного файла в working tree
git checkout -- <file>                  # исторический синтаксис (< Git 2.23, всё ещё работает)
git restore <file>                       # современный аналог

# восстановление файла из произвольного коммита
git checkout <commit> -- <file>          # working tree + index
git restore --source=<commit> <file>     # только working tree
git restore --staged <file>              # убрать файл из index (не трогая working tree)

# отложить работу
git stash push -m "..."          # спрятать незакоммиченные правки
git stash list                   # список «заначек»
git stash pop                    # вернуть и удалить из стека
git stash apply                  # вернуть, но оставить в стеке
git stash branch <name>          # вынести заначку в новую ветку (см. ДЗ)
```

---

## Домашнее задание

Живой пример выше уже показал: старый/новый синтаксис `checkout`/`restore`, разницу в
поведении index, `stash push`/`pop`. В ДЗ — те же навыки, но другие сценарии. Работайте
в своём `taskflow`, в **отдельных учебных ветках** от `main` (`hw/...`).

### Задание 1. `git restore --staged` для отмены случайного `git add`

**Шаги:**
1. На ветке `hw/restore-staged` (от `main`) измените два разных файла (например,
   `src/utils/taskUtils.ts` и `src/components/TaskList.tsx`).
2. Выполните `git add .` — застейджили оба файла разом, хотя хотели закоммитить только
   один.
3. С помощью `git restore --staged <file>` уберите из index **только** второй файл, не
   трогая его содержимое в working tree.
4. Закоммитьте первый файл; убедитесь, что второй остался незакоммиченным, но правки на
   диске не потеряны.

**Критерии «сделано»:**
- `git status -s` до коммита показывает один файл `M ` (staged), второй ` M` (unstaged).
- После коммита второй файл по-прежнему изменён на диске (`git diff` показывает правку).

**Подсказки:** `restore --staged` — это «reset для одного файла»: убирает из index, но
working tree не трогает. Сравните с `git reset HEAD -- <file>` — историческая команда с
тем же эффектом.

**Самопроверка:** `git show --stat HEAD` должен содержать только первый файл.

### Задание 2. `git stash branch` — вынести отложенную работу в новую ветку

В живом примере мы делали `stash pop` обратно в ту же ветку. Иногда отложенную работу
правильнее продолжить **в отдельной ветке** — для этого есть `git stash branch`.

**Шаги:**
1. На `main` начните правку (например, добавьте комментарий-заметку в
   `src/components/TaskList.tsx`), но **не** коммитьте.
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
