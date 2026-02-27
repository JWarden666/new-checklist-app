import { Injectable } from '@angular/core';

export interface Task {
  id: number;
  name: string;
  completed: boolean;
}

export interface HistoryEntry {
  date: Date;
  tasks: Task[];
  completionPercentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private tasks: Task[] = [];
  private history: HistoryEntry[] = [];
  private nextId = 1;

  constructor() {
    this.loadFromStorage();
    this.setupAlerts();
  }

  getTasks(): Task[] {
    return this.tasks;
  }

  addTask(name: string): void {
    if (name.trim()) {
      this.tasks.push({ id: this.nextId++, name: name.trim(), completed: false });
      this.saveToStorage();
    }
  }

  toggleTask(id: number): void {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveToStorage();
    }
  }

  checkAll(): void {
    this.tasks.forEach(t => t.completed = true);
    this.saveToStorage();
  }

  wipeClean(): void {
    if (this.tasks.length > 0) {
      const completion = this.getCompletionPercentage();
      this.history.push({
        date: new Date(),
        tasks: [...this.tasks], // Snapshot
        completionPercentage: completion
      });
    }
    this.tasks = [];
    this.saveToStorage();
  }

  getHistory(): HistoryEntry[] {
    return this.history;
  }

  getCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    const completed = this.tasks.filter(t => t.completed).length;
    return Math.round((completed / this.tasks.length) * 100);
  }

  private saveToStorage(): void {
    localStorage.setItem('tasks', JSON.stringify(this.tasks));
    localStorage.setItem('history', JSON.stringify(this.history));
    localStorage.setItem('nextId', this.nextId.toString());
  }

  private loadFromStorage(): void {
    const tasksJson = localStorage.getItem('tasks');
    const historyJson = localStorage.getItem('history');
    const nextIdStr = localStorage.getItem('nextId');

    this.tasks = tasksJson ? JSON.parse(tasksJson) : [];
    this.history = historyJson ? JSON.parse(historyJson).map((entry: any) => ({
      ...entry,
      date: new Date(entry.date)
    })) : [];
    this.nextId = nextIdStr ? parseInt(nextIdStr, 10) : 1;
  }

  private setupAlerts(): void {
    setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const remaining = this.tasks.filter(t => !t.completed).length;

      if (minute === 0 && (hour === 8 || hour === 12 || hour === 14 || hour === 16) && remaining > 0) {
        alert(`Reminder: You have ${remaining} tasks remaining to complete!`);
      }
    }, 60000); // Check every minute
  }
}