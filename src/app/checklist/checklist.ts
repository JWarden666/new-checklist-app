import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TaskCheck {
  label: string;
  completed: boolean;
}

export interface Task {
  section: string;
  name: string;
  completed: boolean;
  checks?: TaskCheck[]; // multiple checkboxes per item (e.g. Backroom / Daily Counts)
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
  newSectionName: string = '';
  readonly NEW_SECTION = '__new__';

  // Inline editing state
  editingTask: Task | null = null;
  editDraft: string = '';
  editingSection: string | null = null;
  sectionDraft: string = '';

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

  /** Counts checkboxes: plain items count once, multi-check items count each checkbox */
  private countUnits(tasks: Task[]): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const t of tasks) {
      if (t.checks?.length) {
        total += t.checks.length;
        done += t.checks.filter(c => c.completed).length;
      } else {
        total += 1;
        if (t.completed) done += 1;
      }
    }
    return { done, total };
  }

  private completionFor(tasks: Task[]): number {
    const { done, total } = this.countUnits(tasks);
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }

  get currentCompletionPercentage(): number {
    return this.completionFor(this.tasks);
  }

  get completedTasksTotal(): number {
    return this.countUnits(this.tasks).done;
  }

  get totalTasksUnits(): number {
    return this.countUnits(this.tasks).total;
  }

  private getDefaultTasks(): Task[] {
    return [
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
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Balers', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Battery PIT (AM)', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Battery PIT (PM)', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Propane PIT (AM)', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Propane PIT (PM)', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Oven', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Slicers', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Meat Saw', completed: false },
    { section: 'Equipment Inspections', name: 'Equipment Inspections - Grinder', completed: false },
    { section: 'Fresh Production', name: 'Bakery', completed: false },
    { section: 'Fresh Production', name: 'Deli', completed: false },
    { section: 'Fresh Production', name: 'Meat', completed: false },
    { section: 'Fresh Production', name: 'Starbucks', completed: false },
    { section: 'Fresh Production', name: 'Murrays', completed: false },
    { section: 'Replenishment', name: 'HABA', completed: false },
    { section: 'Replenishment', name: 'Produce', completed: false },
    ...ChecklistComponent.backroomCountTasks(),
    ];
  }

  private static readonly BACKROOM_SECTION = 'Backroom/Daily Counts';
  private static readonly BACKROOM_DEPARTMENTS = [
    'Produce', 'Deli', 'Bakery', "Murray's", 'Meat', 'Seafood', 'Grocery', 'HBC',
  ];

  private static backroomCountTasks(): Task[] {
    return ChecklistComponent.BACKROOM_DEPARTMENTS.map(name => ({
      section: ChecklistComponent.BACKROOM_SECTION,
      name,
      completed: false,
      checks: [
        { label: 'Backroom', completed: false },
        { label: 'Daily Counts', completed: false },
      ],
    }));
  }

  /**
   * Version of the built-in section layout. Saved checklists from an older layout
   * are upgraded once; after that, sections are fully user-editable and are never
   * touched by the upgrade again.
   */
  private static readonly LAYOUT_VERSION = 3;

  /** Version 2: sections retired from the checklist — dropped from data saved under layout 1 */
  private static readonly REMOVED_SECTIONS = ['Period', 'Daily To Do', 'Go Spot Check', 'Observations', 'Weekly'];

  /** Version 2: sections that were renamed — data saved under layout 1 is remapped to the new name */
  private static readonly RENAMED_SECTIONS: Record<string, string> = {
    'Directed Replenishment': 'Replenishment',
  };

  /** Version 3: sections renamed after editing was introduced */
  private static readonly RENAMED_SECTIONS_V3: Record<string, string> = {
    'Daily Processes': 'Equipment Inspections',
  };

  /**
   * Brings tasks saved under an older layout in line with the current one. Custom
   * tasks added by users in other sections are left untouched.
   */
  private upgradeLayout(tasks: Task[], layoutVersion?: number): { tasks: Task[]; upgraded: boolean } {
    const fromVersion = layoutVersion ?? 1;
    if (fromVersion >= ChecklistComponent.LAYOUT_VERSION) {
      return { tasks, upgraded: false };
    }
    let upgraded = tasks;
    if (fromVersion < 2) {
      upgraded = upgraded
        .filter(t => !ChecklistComponent.REMOVED_SECTIONS.includes(t.section))
        .map(t => ({
          ...t,
          section: ChecklistComponent.RENAMED_SECTIONS[t.section] ?? t.section,
        }));
      if (!upgraded.some(t => t.section === ChecklistComponent.BACKROOM_SECTION)) {
        upgraded.push(...ChecklistComponent.backroomCountTasks());
      }
    }
    if (fromVersion < 3) {
      upgraded = upgraded.map(t => ({
        ...t,
        section: ChecklistComponent.RENAMED_SECTIONS_V3[t.section] ?? t.section,
      }));
    }
    return { tasks: upgraded, upgraded: true };
  }

  /** Plain copy of tasks without UI state, optionally with all checkboxes cleared */
  private serializeTasks(tasks: Task[], reset = false): Task[] {
    return tasks.map(t => ({
      section: t.section,
      name: t.name,
      completed: reset ? false : t.completed,
      ...(t.checks?.length
        ? { checks: t.checks.map(c => ({ label: c.label, completed: reset ? false : c.completed })) }
        : {}),
    }));
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
        const { tasks, upgraded } = this.upgradeLayout(data.tasks, data.layoutVersion);
        this.tasks = tasks;
        this.cloudVersion = data.version;
        // Push the upgraded layout back so other devices pick it up too
        if (upgraded) {
          await this.saveToCloud();
        }
      } else {
        // No cloud data yet — use localStorage (migration) or the saved template
        this.tasks = this.readLocalTasks() ?? await this.loadTemplate();
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
        layoutVersion: ChecklistComponent.LAYOUT_VERSION,
        tasks: this.serializeTasks(this.tasks),
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
    // Don't swap data out from under an in-progress edit; the next poll catches up
    if (this.isSaving || this.editingTask || this.editingSection) return;

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
        this.tasks = this.upgradeLayout(data.tasks, data.layoutVersion).tasks;
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
      const record: TaskHistory = {
        date: this.dateKey,
        tasks: this.serializeTasks(this.tasks),
        completionPercentage: this.completionFor(this.tasks),
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
        this.tasks = this.upgradeLayout(data.tasks, data.layoutVersion).tasks;
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
    task.completed = !task.completed;
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  toggleCheck(task: Task, check: TaskCheck) {
    check.completed = !check.completed;
    task.completed = !!task.checks?.every(c => c.completed);
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
  }

  saveCompletionPercentage() {
    const record: TaskHistory = {
      date: this.dateKey,
      tasks: this.serializeTasks(this.tasks),
      completionPercentage: this.completionFor(this.tasks)
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
    return this.countUnits(this.getTasksBySection(section)).done;
  }

  totalTasksCount(section: string): number {
    return this.countUnits(this.getTasksBySection(section)).total;
  }

  getTasksBySection(section: string): Task[] {
    return this.tasks.filter(t => t.section === section);
  }

  sections(): string[] {
    return [...new Set(this.tasks.map(t => t.section))];
  }

  // ------------------- Add / Edit / Delete -------------------
  /** Persists a structural change (sections/items) to today and to the template for future days */
  private commitStructureChange() {
    this.saveTasksToLocal();
    this.debouncedSaveToCloud();
    this.saveTemplate();
  }

  addTask() {
    const name = this.newTaskName.trim();
    const section = this.newTaskSection === this.NEW_SECTION
      ? this.newSectionName.trim()
      : this.newTaskSection.trim();
    if (!name || !section) return;

    // New items in a multi-checkbox section (e.g. Backroom/Daily Counts) get the same checkboxes
    const sibling = this.getTasksBySection(section).find(t => t.checks?.length);
    const task: Task = { section, name, completed: false };
    if (sibling?.checks) {
      task.checks = sibling.checks.map(c => ({ label: c.label, completed: false }));
    }

    // Keep the item with the rest of its section
    const lastIndex = this.tasks.map(t => t.section).lastIndexOf(section);
    if (lastIndex === -1) {
      this.tasks.push(task);
    } else {
      this.tasks.splice(lastIndex + 1, 0, task);
    }

    this.newTaskName = '';
    this.newTaskSection = '';
    this.newSectionName = '';
    this.commitStructureChange();
  }

  startEditing(task: Task) {
    this.editingTask = task;
    this.editDraft = task.name;
  }

  saveEdit(task: Task) {
    const newName = this.editDraft.trim();
    if (!newName) return;
    task.name = newName;
    this.editingTask = null;
    this.commitStructureChange();
  }

  cancelEdit() {
    this.editingTask = null;
    this.editDraft = '';
  }

  deleteTask(task: Task) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    this.tasks = this.tasks.filter(t => t !== task);
    if (this.selectedTask === task) this.selectedTask = null;
    if (this.editingTask === task) this.editingTask = null;
    this.commitStructureChange();
  }

  startSectionEdit(section: string) {
    this.editingSection = section;
    this.sectionDraft = section;
  }

  saveSectionEdit(section: string) {
    const newName = this.sectionDraft.trim();
    if (!newName) return;
    if (newName !== section && this.sections().includes(newName)) {
      alert(`A section named "${newName}" already exists.`);
      return;
    }
    this.tasks.forEach(t => {
      if (t.section === section) t.section = newName;
    });
    if (this.newTaskSection === section) this.newTaskSection = newName;
    this.editingSection = null;
    this.commitStructureChange();
  }

  cancelSectionEdit() {
    this.editingSection = null;
    this.sectionDraft = '';
  }

  deleteSection(section: string) {
    const count = this.getTasksBySection(section).length;
    if (!confirm(`Delete the "${section}" section and its ${count} item(s)?`)) return;
    this.tasks = this.tasks.filter(t => t.section !== section);
    if (this.selectedTask?.section === section) this.selectedTask = null;
    if (this.newTaskSection === section) this.newTaskSection = '';
    this.editingSection = null;
    this.commitStructureChange();
  }

  // ------------------- Template -------------------
  /** Loads the section/item layout new days start from, falling back to the built-in defaults */
  private async loadTemplate(): Promise<Task[]> {
    try {
      const res = await fetch('/api/template');
      if (!res.ok) throw new Error('Failed to load template');
      const data = await res.json();
      if (data.exists && data.tasks?.length > 0) {
        // Templates were introduced with layout 2, so an unversioned template is layout 2
        const { tasks, upgraded } = this.upgradeLayout(data.tasks, data.layoutVersion ?? 2);
        if (upgraded) this.saveTemplate(tasks);
        return this.serializeTasks(tasks, true);
      }
    } catch (err) {
      console.error('Template load failed, using defaults:', err);
    }
    return this.getDefaultTasks();
  }

  private saveTemplate(tasks: Task[] = this.tasks) {
    fetch('/api/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layoutVersion: ChecklistComponent.LAYOUT_VERSION,
        tasks: this.serializeTasks(tasks, true),
      }),
    }).catch(err => console.error('Failed to save template:', err));
  }

  // ------------------- History / Local Storage -------------------
  saveTasksToLocal() {
    const key = `checklist-${this.dateKey}`;
    localStorage.setItem(key, JSON.stringify({
      layoutVersion: ChecklistComponent.LAYOUT_VERSION,
      tasks: this.serializeTasks(this.tasks),
    }));
  }

  /** Reads today's tasks from localStorage (supports the older plain-array format) */
  private readLocalTasks(): Task[] | null {
    const saved = localStorage.getItem(`checklist-${this.dateKey}`);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return this.upgradeLayout(parsed, 1).tasks;
      if (Array.isArray(parsed?.tasks)) return this.upgradeLayout(parsed.tasks, parsed.layoutVersion).tasks;
    } catch {
      // Corrupt local data — ignore it
    }
    return null;
  }

  private loadTodayTasksLocal() {
    const saved = this.readLocalTasks();
    if (saved) this.tasks = saved;
  }

  saveHistory() {
    const record: TaskHistory = {
      date: this.dateKey,
      tasks: this.serializeTasks(this.tasks),
      completionPercentage: this.completionFor(this.tasks)
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
