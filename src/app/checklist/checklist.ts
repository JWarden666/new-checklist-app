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
  date: string;
  tasks: Task[];
  completionPercentage: number;
}

export interface HistorySummary {
  date: string;
  completionPercentage: number;
  taskCount: number;
  completedCount: number;
}

@Component({
  selector: 'app-checklist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checklist.html',
  styleUrls: ['./checklist.css']
})
export class ChecklistComponent implements OnInit {
  currentDate: string = '';
  searchDate: string = '';
  tasks: Task[] = [];
  selectedTask: Task | null = null;
  historyTasks: Task[] = [];
  historyCompletion: number = 0;
  showHistory: boolean = false;
  historyList: HistorySummary[] = [];
  historyLoading: boolean = false;
  selectedHistoryDate: string = '';

  newTaskName: string = '';
  newTaskSection: string = '';

  get currentCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    return Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
  }

  get completedTasksTotal(): number {
    return this.tasks.filter(t => t.completed).length;
  }

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
    this.currentDate = today.toLocaleDateString();
    this.loadTodayTasks();
  }

  // ------------------- Task Management -------------------
  toggleTask(task: Task) {
    task.completed = !task.completed;
    this.saveTasksToLocal();
    this.saveCompletionPercentage();
  }

  saveCompletionPercentage() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.currentDate,
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      completionPercentage: completion
    };
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(err => console.error('Failed to save completion percentage:', err));
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
  }

  startEditing(task: Task) {
    task.editing = true;
  }

  saveEdit(task: Task, newName: string) {
    if (!newName.trim()) return;
    task.name = newName.trim();
    task.editing = false;
    this.saveTasksToLocal();
  }

  cancelEdit(task: Task) {
    task.editing = false;
  }

  deleteTask(task: Task) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    this.tasks = this.tasks.filter(t => t !== task);
    if (this.selectedTask === task) this.selectedTask = null;
    this.saveTasksToLocal();
  }

  // ------------------- History / Local Storage -------------------
  saveTasksToLocal() {
    const key = `checklist-${this.currentDate}`;
    localStorage.setItem(key, JSON.stringify(this.tasks));
  }

  loadTodayTasks() {
    const key = `checklist-${this.currentDate}`;
    const saved = localStorage.getItem(key);
    if (saved) this.tasks = JSON.parse(saved);
  }

  saveHistory() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.currentDate,
      tasks: JSON.parse(JSON.stringify(this.tasks)),
      completionPercentage: completion
    };
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })
      .then(res => res.json())
      .then(() => alert('History saved!'))
      .catch(err => console.error(err));
  }

  loadHistory() {
    if (!this.searchDate) return;
    this.loadHistoryForDate(this.searchDate);
  }

  toggleHistoryView() {
    this.showHistory = !this.showHistory;
    if (this.showHistory && this.historyList.length === 0) {
      this.fetchHistoryList();
    }
  }

  fetchHistoryList() {
    this.historyLoading = true;
    fetch('/api/history')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load history');
        return res.json();
      })
      .then((data: HistorySummary[]) => {
        this.historyList = data;
        this.historyLoading = false;
      })
      .catch(err => {
        console.error('Failed to load history list:', err);
        this.historyLoading = false;
      });
  }

  viewHistoryEntry(date: string) {
    this.selectedHistoryDate = date;
    this.loadHistoryForDate(date);
  }

  private loadHistoryForDate(date: string) {
    fetch(`/api/history/${date}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data: TaskHistory) => {
        this.historyTasks = data.tasks;
        this.historyCompletion = data.completionPercentage;
        this.selectedHistoryDate = date;
      })
      .catch(() => alert('No history found for this date'));
  }

  closeHistoryDetail() {
    this.historyTasks = [];
    this.historyCompletion = 0;
    this.selectedHistoryDate = '';
  }

  closeHistoryView() {
    this.showHistory = false;
    this.historyTasks = [];
    this.historyCompletion = 0;
    this.selectedHistoryDate = '';
  }
}