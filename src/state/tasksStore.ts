import { useCallback, useState } from 'react'

export type Task = {
  id: string
  title: string
  done: boolean
  createdAt: number
}

let seq = 0
const nextId = () => `t${++seq}`

const initialTasks: Task[] = [
  { id: nextId(), title: 'Установить Git', done: true, createdAt: 1 },
  { id: nextId(), title: 'Сделать первый коммит', done: false, createdAt: 2 },
  { id: nextId(), title: 'Разобраться с ветками', done: false, createdAt: 3 },
]

/**
 * Простейшее «хранилище» задач на useState.
 * Намеренно без внешних библиотек — Git в центре внимания, а не state-менеджер.
 */
export function useTasksStore() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  const addTask = useCallback((title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setTasks((prev) => [
      ...prev,
      { id: nextId(), title: trimmed, done: false, createdAt: Date.now() },
    ])
  }, [])

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { tasks, addTask, toggleTask, removeTask }
}
