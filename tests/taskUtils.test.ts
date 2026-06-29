import { describe, expect, it } from 'vitest'
import type { Task } from '../src/state/tasksStore'
import {
  countRemaining,
  filterTasks,
  sortTasks,
} from '../src/utils/taskUtils'

const make = (over: Partial<Task>): Task => ({
  id: 'x',
  title: 'task',
  done: false,
  createdAt: 0,
  ...over,
})

const tasks: Task[] = [
  make({ id: 'a', done: false, createdAt: 2 }),
  make({ id: 'b', done: true, createdAt: 1 }),
  make({ id: 'c', done: false, createdAt: 3 }),
]

describe('filterTasks', () => {
  it('возвращает все задачи для фильтра "all"', () => {
    expect(filterTasks(tasks, 'all')).toHaveLength(3)
  })

  it('оставляет только невыполненные для "active"', () => {
    expect(filterTasks(tasks, 'active').map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('оставляет только выполненные для "done"', () => {
    expect(filterTasks(tasks, 'done').map((t) => t.id)).toEqual(['b'])
  })
})

describe('sortTasks', () => {
  it('ставит невыполненные выше и сортирует по createdAt', () => {
    expect(sortTasks(tasks).map((t) => t.id)).toEqual(['a', 'c', 'b'])
  })

  it('не мутирует исходный массив', () => {
    const copy = [...tasks]
    sortTasks(tasks)
    expect(tasks).toEqual(copy)
  })
})

describe('countRemaining', () => {
  it('считает количество невыполненных задач', () => {
    expect(countRemaining(tasks)).toBe(2)
  })
})
