import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Task {
  section: string;
  name: string;
  completed: boolean;
  editing?: boolean; // for inline editing
}

export interface TaskHistory {
  dateKey: string;
  dateLabel: string;
  tasks: Task[];
  completionPercentage: number;
}

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checklist.html',
  styleUrls: ['./checklist.css']
})
export class ChecklistComponent implements OnInit {
  currentDateKey: string = '';
  currentDateLabel: string = '';
  searchDate: string = '';
  tasks: Task[] = [];
  selectedTask: Task | null = null;
  historyTasks: Task[] = [];
  historyCompletion: number = 0;
  history: TaskHistory[] = [];
  currentCompletionValue: number = 0;
  historyDateLabel: string = '';

  newTaskName: string = '';
  newTaskSection: string = '';

  constructor() {
    // Initialize your tasks
    this.tasks = [
    { section: 'Period', name: 'Adult Bev Display Compliance First Wednesday of the Period', completed: false },
    { section: 'Daily To Do', name: 'Emergency Exit Survey', completed: false },
    { section: 'Daily To Do', name: 'Wall To Wall - Bakery', completed: false },
    { section: 'Daily To Do', name: 'Wall To Wall - Grocery', completed: false },
    { section: 'Go Spot Check', name: 'Morning (11am-2pm)', completed: false },
    { section: 'Go Spot Check', name: 'Afternoon (2pm-5pm)', completed: false },
    { section: 'Go Spot Check', name: 'Evening (5pm-8pm)', completed: false },
    { section: 'Store Leader Walk', name: 'Grocery Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Drug/Gm Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Pick Up Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Produce/Floral Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Deli Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Bakery Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Meat and Seafood Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Front End Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Pharmacy Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Home Store Leader', completed: false },
    { section: 'Store Leader Walk', name: 'Apparel Store Leader', completed: false },
    { section: 'Dept Leader', name: 'Grocery Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Drug/Gm Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Pick Up Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Produce/Floral Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Deli Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Starbucks Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Bakery Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Meat and Seafood Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Front End Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Pharmacy Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Home Dept Leader', completed: false },
    { section: 'Dept Leader', name: 'Apparel Dept Leader', completed: false },
    { section: 'Closing MOD Duties', name: 'Getting a Good Close GSC', completed: false },
    { section: 'Closing MOD Duties', name: 'Trash', completed: false },
    { section: 'Closing MOD Duties', name: 'Sign Getting a Good Close', completed: false },
    { section: 'Weekly', name: 'Sustainment Check on Monday', completed: false },
    { section: 'Weekly', name: 'Quick Post Schedule on Thursday', completed: false },
    { section: 'Weekly', name: 'Center Store / HABA Merchandise Plan GSC on Wednesday', completed: false },
    { section: 'Weekly', name: 'Monday Wall 2 Wall', completed: false },
    { section: 'Weekly', name: 'FSSR Go Spot Check', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Balers', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Battery PIT (AM)', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Battery PIT (PM)', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Propane PIT (AM)', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Propane PIT (PM)', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Oven', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Slicers', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Meat Saw', completed: false },
    { section: 'Daily Processes', name: 'Equipment Inspections - Grinder', completed: false },
    { section: 'Fresh Production', name: 'Bakery', completed: false },
    { section: 'Fresh Production', name: 'Deli', completed: false },
    { section: 'Fresh Production', name: 'Meat', completed: false },
    { section: 'Fresh Production', name: 'Starbucks', completed: false },
    { section: 'Fresh Production', name: 'Murrays', completed: false },
    { section: 'Directed Replenishment', name: 'HABA', completed: false },
    { section: 'Directed Replenishment', name: 'Produce', completed: false },
    { section: 'Observations', name: 'Daily Backroom Counts', completed: false },
    { section: 'Observations', name: 'Fix and Fills - AM', completed: false },
    { section: 'Observations', name: 'Fix and Fills - PM', completed: false },
    { section: 'Observations', name: 'Product Date Management', completed: false },
    { section: 'Observations', name: 'Top Stock', completed: false },
  ];
  }

  ngOnInit(): void {
    const today = new Date();
    this.currentDateKey = today.toISOString().split('T')[0];
    this.currentDateLabel = today.toLocaleDateString();
    this.loadTodayTasks();
    this.loadHistoryFromLocal();
    this.updateCurrentCompletion();
  }

  // ------------------- Task Management -------------------
  toggleTask(task: Task) {
    task.completed = !task.completed;
    this.saveTasksToLocal();
    this.updateCurrentCompletion();
  }

  selectTask(task: Task) {
    this.selectedTask = task;
  }

  completedTasksCount(section: string): number {
    return this.getTasksBySection(section).filter(t => t.completed).length;
  }

  totalTasksCount(section: string): number {
    return this.getTasksBySection(section).length;
  }

  completedTasksTotal(): number {
    return this.tasks.filter(t => t.completed).length;
  }

  getTasksBySection(section: string): Task[] {
    return this.tasks.filter(t => t.section === section);
  }

  sections(): string[] {
    return [...new Set(this.tasks.map(t => t.section))];
  }

  // ------------------- Add / Edit / Delete -------------------
  addTask() {
    if (!this.newTaskName.trim() || !this.newTaskSection.trim()) return;
    this.tasks.push({
      section: this.newTaskSection.trim(),
      name: this.newTaskName.trim(),
      completed: false
    });
    this.newTaskName = '';
    this.newTaskSection = '';
    this.saveTasksToLocal();
    this.updateCurrentCompletion();
  }

  startEditing(task: Task) {
    task.editing = true;
  }

  saveEdit(task: Task, newName: string) {
    if (!newName.trim()) return;
    task.name = newName.trim();
    task.editing = false;
    this.saveTasksToLocal();
    this.updateCurrentCompletion();
  }

  cancelEdit(task: Task) {
    task.editing = false;
  }

  deleteTask(task: Task) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    this.tasks = this.tasks.filter(t => t !== task);
    if (this.selectedTask === task) this.selectedTask = null;
    this.saveTasksToLocal();
    this.updateCurrentCompletion();
  }

  // ------------------- History / Local Storage -------------------
  saveTasksToLocal() {
    const key = `checklist-${this.currentDateKey}`;
    localStorage.setItem(key, JSON.stringify(this.tasks));
  }

  loadTodayTasks() {
    const key = `checklist-${this.currentDateKey}`;
    const saved = localStorage.getItem(key);
    if (saved) this.tasks = JSON.parse(saved);
  }

  saveHistory() {
    const completion = this.calculateCompletion(this.tasks);
    const record: TaskHistory = {
      dateKey: this.currentDateKey,
      dateLabel: this.currentDateLabel,
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      completionPercentage: completion
    };
    const existingIndex = this.history.findIndex(entry => entry.dateKey === record.dateKey);
    if (existingIndex >= 0) {
      this.history[existingIndex] = record;
    } else {
      this.history.push(record);
    }
    this.history = this.sortHistory(this.history);
    this.persistHistory();
    alert('History saved!');
  }

  loadHistory() {
    if (!this.searchDate) return;
    const match = this.history.find(entry => entry.dateKey === this.searchDate);
    if (!match) {
      alert('No history found for this date');
      this.historyTasks = [];
      this.historyCompletion = 0;
      this.historyDateLabel = '';
      return;
    }
    this.historyTasks = match.tasks;
    this.historyCompletion = match.completionPercentage;
    this.historyDateLabel = match.dateLabel;
  }

  private updateCurrentCompletion() {
    this.currentCompletionValue = this.calculateCompletion(this.tasks);
  }

  private calculateCompletion(tasks: Task[]): number {
    if (!tasks.length) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  }

  private loadHistoryFromLocal() {
    const stored = localStorage.getItem('checklist-history');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as TaskHistory[];
      if (Array.isArray(parsed)) {
        this.history = this.sortHistory(parsed);
      }
    } catch {
      this.history = [];
    }
  }

  private persistHistory() {
    localStorage.setItem('checklist-history', JSON.stringify(this.history));
  }

  private sortHistory(history: TaskHistory[]): TaskHistory[] {
    return [...history].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }
}
