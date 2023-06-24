import { Task } from "./common";

/**
 * Chapter metadata
 */
export class Chapter {
  title: string;
  paths: string[];
  offset: number;

  constructor(title: string, paths: string[], offset: number) {
    this.title = title;
    this.paths = paths;
    this.offset = offset;
  }
}

/**
 * Title metadata
 */
export class Title {
  title: string;
  subtitle: string;
  collection: string;

  constructor(title: string, subtitle: string, collection: string) {
    this.title = title;
    this.subtitle = subtitle;
    this.collection = collection;
  }
}

/**
 * Network traffic load state
 */
export class LoadState {
  id: string;
  expires: Date;
  cover_href: string;
  title: Title;
  authors: Array<string>;
  narrators: Array<string>;
  description: string;
  chapters: Array<Chapter>;

  loaded(): boolean {
    return this.expires != undefined
      && this.title != undefined
      && this.chapters != undefined
      && this.authors != undefined;
  }
}

export class ParsedPartPath {
  path: string;
  offset: number;

  constructor(path: string) {
    const split = path.split("#");
    if (split.length === 2) {
      this.offset = parseInt(split[1]);
    } else {
      this.offset = 0;
    }
    this.path = split[0]
  }
}

/**
 * Add task to task list
 *
 * @param task
 */
export async function addTask(task: Task): Promise<string> {
  const tasks = await fetchTasks();
  tasks.unshift(task);
  await browser.storage.local.set({ "tasks": tasks });
  return task.id;
}

/**
 * Update state of task
 *
 * @param id
 * @param state
 */
export async function updateTask(id: string, state: string) {
  const tasks = await fetchTasks();
  for (const task of tasks) {
    if (task.id === id) {
      task.state = state;
    }
  }
  await browser.storage.local.set({ "tasks": tasks });
}

/**
 * Fetch active tasks
 */
async function fetchTasks(): Promise<Array<Task>> {
  const storageResponse = await browser.storage.local.get("tasks");
  if (storageResponse.tasks) {
    return storageResponse.tasks;
  } else {
    return [];
  }
}