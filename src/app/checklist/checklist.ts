import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Task {
  section: string;
  name: string;
  completed: boolean;
  parent?: string; // name of the department this item sits under (same section)
  checks?: TaskCheck[]; // extra checkboxes, e.g. temperature windows
  editing?: boolean; // for inline editing
}

export interface TaskCheck {
  label: string;
  completed: boolean;
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
export class ChecklistComponent implements OnInit, OnDestroy {
  currentDate: string = '';
  dateKey: string = '';  // ISO format (YYYY-MM-DD) for consistent cross-device sync
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

  // Cloud sync state
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error' = 'synced';
  cloudVersion: number = 0;
  isRefreshing: boolean = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isSaving: boolean = false;
  private boundVisibilityHandler = this.onVisibilityChange.bind(this);
  private boundFocusHandler = this.onWindowFocus.bind(this);

  // Pacific time zone for consistent day boundaries
  private static readonly PACIFIC_TZ = 'America/Los_Angeles';

  /** Returns the current date key (YYYY-MM-DD) in Pacific time */
  private getPacificDateKey(): string {
    const now = new Date();
    // Format in Pacific time to get the correct calendar date
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ChecklistComponent.PACIFIC_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // en-CA gives YYYY-MM-DD format
    return parts;
  }

  /** Returns a user-friendly display date in Pacific time */
  private getPacificDisplayDate(): string {
    const now = new Date();
    return new Intl.DateTimeFormat('en-US', {
      timeZone: ChecklistComponent.PACIFIC_TZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(now);
  }

  get currentCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    return Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
  }

  get completedTasksTotal(): number {
    return this.tasks.filter(t => t.completed).length;
  }

  private getDefaultTasks(): Task[] {
    return [
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
    { section: 'Fresh Production', parent: 'Bakery', name: 'Prep for Today', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Prep for Tomorrow', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Thaw and Sell', completed: false },
    { section: 'Fresh Production', parent: 'Bakery', name: 'Cookies', completed: false },
    { section: 'Fresh Production', name: 'Deli', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'FSGNG', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'Hot Production', completed: false,
      checks: this.makeChecks(['12pm', '2pm', '4pm', '6pm']) },
    { section: 'Fresh Production', parent: 'Deli', name: 'Cold Production', completed: false },
    { section: 'Fresh Production', parent: 'Deli', name: 'Thaw and Sell', completed: false },
    { section: 'Fresh Production', name: 'Meat', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Production', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Meat Thaw and Sell', completed: false },
    { section: 'Fresh Production', parent: 'Meat', name: 'Seafood Thaw and Sell', completed: false,
      checks: this.makeChecks(['12pm', '4pm']) },
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

  private makeChecks(labels: string[]): TaskCheck[] {
    return labels.map(label => ({ label, completed: false }));
  }

  /**
   * Adds any default sub-items (and their extra checkboxes) that are missing from
   * an existing day's tasks, so days saved before they existed still show them.
   * Returns true if anything was added.
   */
  private mergeDefaultSubItems(tasks: Task[]): boolean {
    let changed = false;
    for (const def of this.getDefaultTasks()) {
      if (!def.parent) continue;
      const existing = tasks.find(t =>
        t.section === def.section && t.parent === def.parent && t.name === def.name);
      if (existing) {
        if (def.checks && !existing.checks) {
          existing.checks = def.checks;
          changed = true;
        }
        continue;
      }
      // Insert after the parent's last existing sub-item (or after the parent itself)
      let insertAt = -1;
      tasks.forEach((t, i) => {
        if (t.section === def.section && (t.name === def.parent && !t.parent || t.parent === def.parent)) {
          insertAt = i;
        }
      });
      if (insertAt === -1) continue; // department was removed — don't resurrect its items
      tasks.splice(insertAt + 1, 0, { ...def });
      changed = true;
    }
    if (changed) this.syncParents(tasks);
    return changed;
  }

  constructor(private cdr: ChangeDetectorRef) {
    this.tasks = this.getDefaultTasks();
  }

  ngOnInit(): void {
    this.currentDate = this.getPacificDisplayDate();
    this.dateKey = this.getPacificDateKey();
    this.loadFromCloud();
    this.startPolling();

    // Listen for visibility and focus changes to sync across devices
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('focus', this.boundFocusHandler);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    window.removeEventListener('focus', this.boundFocusHandler);
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.refreshData();
    }
  }

  private onWindowFocus(): void {
    this.refreshData();
  }

  // ------------------- Cloud Sync -------------------
  private getDateKey(): string {
    return this.dateKey;
  }

  async loadFromCloud(): Promise<void> {
    this.syncStatus = 'syncing';
    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.tasks = data.tasks;
        this.cloudVersion = data.version;
        if (this.mergeDefaultSubItems(this.tasks)) {
          await this.saveToCloud();
        }
      } else {
        // No cloud data yet — use defaults (or localStorage as migration)
        const localKey = `checklist-${this.dateKey}`;
        const saved = localStorage.getItem(localKey);
        if (saved) {
          this.tasks = JSON.parse(saved);
          this.mergeDefaultSubItems(this.tasks);
        }
        // Push initial state to cloud
        await this.saveToCloud();
      }
      this.syncStatus = 'synced';
    } catch (err) {
      console.error('Cloud load failed, falling back to local:', err);
      this.syncStatus = 'offline';
      this.loadTodayTasksLocal();
    } finally {
      this.cdr.markForCheck();
    }
  }

  private async saveToCloud(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.syncStatus = 'syncing';

    try {
      const payload = {
        date: this.dateKey,
        tasks: this.tasks.map(t => ({
          section: t.section,
          name: t.name,
          completed: t.completed,
          ...(t.parent ? { parent: t.parent } : {}),
          ...(t.checks ? { checks: t.checks.map(c => ({ label: c.label, completed: c.completed })) } : {}),
        })),
      };

      const res = await fetch(`/api/checklist/${this.getDateKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to save');

      const data = await res.json();
      this.cloudVersion = data.version;
      this.syncStatus = 'synced';

      // Also save to localStorage as backup
      this.saveTasksToLocal();
    } catch (err) {
      console.error('Cloud save failed:', err);
      this.syncStatus = 'error';
      this.saveTasksToLocal();
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  private debouncedSaveToCloud(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToCloud();
      this.saveCompletionPercentage();
    }, 500);
  }

  private async pollForChanges(): Promise<void> {
    if (this.isSaving) return;

    // Check if the day has changed in Pacific time (midnight PST/PDT rollover)
    const currentPacificDate = this.getPacificDateKey();
    if (currentPacificDate !== this.dateKey) {
      await this.handleNewDay(currentPacificDate);
      return;
    }

    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) return;

      const data = await res.json();
      if (data.exists && data.version > this.cloudVersion) {
        // Newer version available — update local state
        this.cloudVersion = data.version;
        this.tasks = data.tasks;
        this.saveTasksToLocal();
        this.syncStatus = 'synced';
        this.cdr.markForCheck();
      }
    } catch {
      // Silent fail on poll — will retry next interval
    }
  }

  /** Handle the transition to a new day at midnight Pacific time */
  private async handleNewDay(newDateKey: string): Promise<void> {
    // Save history for the previous day before resetting
    try {
      const completion = Math.round(
        (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
      );
      const record: TaskHistory = {
        date: this.dateKey,
        tasks: JSON.parse(JSON.stringify(this.tasks)),
        completionPercentage: completion,
      };
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.error('Failed to auto-save history on day change:', err);
    }

    // Switch to the new day
    this.dateKey = newDateKey;
    this.currentDate = this.getPacificDisplayDate();
    this.cloudVersion = 0;
    this.tasks = this.getDefaultTasks();

    // Load new day's data from cloud (in case another device already created it)
    await this.loadFromCloud();
    this.cdr.markForCheck();
  }

  /** Full refresh of today's tasks from cloud — called by refresh button and visibility events */
  async refreshData(): Promise<void> {
    if (this.isSaving) return;

    // Check if the day has changed in Pacific time
    const currentPacificDate = this.getPacificDateKey();
    if (currentPacificDate !== this.dateKey) {
      await this.handleNewDay(currentPacificDate);
      return;
    }

    this.isRefreshing = true;
    this.syncStatus = 'syncing';

    try {
      const res = await fetch(`/api/checklist/${this.getDateKey()}`);
      if (!res.ok) throw new Error('Failed to refresh');

      const data = await res.json();
      if (data.exists && data.tasks && data.tasks.length > 0) {
        this.cloudVersion = data.version;
        this.tasks = data.tasks;
        this.saveTasksToLocal();
      }
      this.syncStatus = 'synced';
    } catch (err) {
      console.error('Refresh failed:', err);
      this.syncStatus = 'error';
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }

    // Also refresh history list if the panel is open
    if (this.showHistory) {
      this.fetchHistoryList();
    }
  }

  private startPolling(): void {
    // Poll every 3 seconds for changes from other users
    this.pollInterval = setInterval(() => {
      this.pollForChanges();
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // ------------------- Task Management -------------------
  toggleTask(task: Task) {
    // Departments with sub-items check themselves automatically
    if (this.hasChildren(task)) return;
    task.completed = !task.completed;
    this.syncParents(this.tasks);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  toggleCheck(check: TaskCheck) {
    check.completed = !check.completed;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  isParentOf(parent: Task, child: Task): boolean {
    return !parent.parent && child.parent === parent.name && child.section === parent.section;
  }

  getChildTasks(parent: Task): Task[] {
    return this.tasks.filter(t => this.isParentOf(parent, t));
  }

  hasChildren(task: Task): boolean {
    return this.tasks.some(t => this.isParentOf(task, t));
  }

  /** Marks each department complete when all of its sub-items are complete */
  private syncParents(tasks: Task[]): void {
    for (const parent of tasks) {
      if (parent.parent) continue;
      const children = tasks.filter(t =>
        t.parent === parent.name && t.section === parent.section);
      if (children.length > 0) {
        parent.completed = children.every(c => c.completed);
      }
    }
  }

  /** Tasks for a section in display order: each top-level item followed by its sub-items */
  getDisplayTasks(section: string): Task[] {
    const sectionTasks = this.getTasksBySection(section);
    const topLevel = sectionTasks.filter(t =>
      !t.parent || !sectionTasks.some(p => this.isParentOf(p, t)));
    const ordered: Task[] = [];
    for (const task of topLevel) {
      ordered.push(task);
      if (!task.parent) {
        ordered.push(...sectionTasks.filter(t => this.isParentOf(task, t)));
      }
    }
    return ordered;
  }

  saveCompletionPercentage() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.dateKey,
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
    this.debouncedSaveToCloud();
  }

  private originalNames = new Map<Task, string>();

  startEditing(task: Task) {
    this.originalNames.set(task, task.name);
    task.editing = true;
  }

  saveEdit(task: Task, newName: string) {
    if (!newName.trim()) return;
    const oldName = this.originalNames.get(task) ?? task.name;
    // Keep sub-items attached when a department is renamed
    if (!task.parent) {
      this.tasks
        .filter(t => t !== task && t.parent === oldName && t.section === task.section)
        .forEach(t => (t.parent = newName.trim()));
    }
    this.originalNames.delete(task);
    task.name = newName.trim();
    task.editing = false;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  cancelEdit(task: Task) {
    const oldName = this.originalNames.get(task);
    if (oldName !== undefined) task.name = oldName;
    this.originalNames.delete(task);
    task.editing = false;
  }

  deleteTask(task: Task) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const children = this.getChildTasks(task);
    this.tasks = this.tasks.filter(t => t !== task && !children.includes(t));
    if (this.selectedTask === task) this.selectedTask = null;
    this.syncParents(this.tasks);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  // ------------------- History / Local Storage -------------------
  saveTasksToLocal() {
    const key = `checklist-${this.dateKey}`;
    localStorage.setItem(key, JSON.stringify(this.tasks));
  }

  private loadTodayTasksLocal() {
    const key = `checklist-${this.dateKey}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      this.tasks = JSON.parse(saved);
      this.mergeDefaultSubItems(this.tasks);
    }
  }

  saveHistory() {
    const completion = Math.round(
      (this.tasks.filter(t => t.completed).length / this.tasks.length) * 100
    );
    const record: TaskHistory = {
      date: this.dateKey,
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
        this.cdr.markForCheck();
      })
      .catch(err => {
        console.error('Failed to load history list:', err);
        this.historyLoading = false;
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        alert('No history found for this date');
        this.cdr.markForCheck();
      });
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
