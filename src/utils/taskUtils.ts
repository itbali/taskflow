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

/** Сортировка: незавершённые сверху, затем по времени создания. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.createdAt - b.createdAt
  })
}

/** Счётчик оставшихся (невыполненных) задач. */
export function countRemaining(tasks: Task[]): number {
  return tasks.reduce((acc, t) => (t.done ? acc : acc + 1), 0)
}
