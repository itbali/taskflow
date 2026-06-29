import { useMemo, useState } from 'react'
import { TaskList } from './components/TaskList'
import { useTasksStore } from './state/tasksStore'
import {
  countRemaining,
  filterTasks,
  sortTasks,
  type StatusFilter,
} from './utils/taskUtils'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'done', label: 'Выполненные' },
]

export default function App() {
  const { tasks, addTask, toggleTask, removeTask } = useTasksStore()
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const visibleTasks = useMemo(
    () => sortTasks(filterTasks(tasks, filter)),
    [tasks, filter],
  )
  const remaining = countRemaining(tasks)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addTask(draft)
    setDraft('')
  }

  return (
    <main className="app">
      <h1 className="app__title">TaskFlow</h1>
      <p className="app__subtitle">Осталось задач: {remaining}</p>

      <form className="app__form" onSubmit={handleSubmit}>
        <input
          className="app__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Новая задача…"
        />
        <button className="app__add" type="submit">
          Добавить
        </button>
      </form>

      <div className="app__filters">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`app__filter ${filter === f.value ? 'app__filter--active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <TaskList
        tasks={visibleTasks}
        onToggle={toggleTask}
        onRemove={removeTask}
      />
    </main>
  )
}
