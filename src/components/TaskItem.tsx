import type { Task } from '../state/tasksStore'

type Props = {
  task: Task
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function TaskItem({ task, onToggle, onRemove }: Props) {
  return (
    <li className={`task-item ${task.done ? 'task-item--done' : ''}`}>
      <label className="task-item__label">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => onToggle(task.id)}
        />
        <span className="task-item__title">{task.title}</span>
      </label>
      <button
        className="task-item__remove"
        onClick={() => onRemove(task.id)}
        aria-label="Удалить задачу"
      >
        ×
      </button>
    </li>
  )
}
