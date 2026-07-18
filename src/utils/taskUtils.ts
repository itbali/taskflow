import type { Task } from '../state/tasksStore'

/**
 * «Горячий» файл — его правят в нескольких модулях, чтобы режиссировать конфликты
 * (две разные реализации сортировки/фильтрации) и прятать регрессию для bisect.
 */

export type StatusFilter = 'all' | 'active' | 'done'

/** Фильтрация задач по статусу. */
export function filterTasks(tasks: Task[], filter: StatusFilter): Task[] {
  switch (filter) {
    case 'active':
      return tasks.filter((t) => !t.done)
    case 'done':
      return tasks.filter((t) => t.done)
    case 'all':
    default:
      return tasks
  }
}

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

/** Счётчик оставшихся (невыполненных) задач. */
export function countRemaining(tasks: Task[]): number {
  return tasks.reduce((acc, t) => (t.done ? acc : acc + 1), 0)
}

/** Текстовый поиск по заголовку задачи (без учёта регистра). */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter((t) => t.title.toLowerCase().includes(q))
}

/** Счётчик выполненных задач. */
export function countDone(tasks: Task[]): number {
  return tasks.reduce((acc, t) => (t.done ? acc + 1 : acc), 0)
}
