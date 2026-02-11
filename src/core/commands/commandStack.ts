// ============================================================
// Command Stack — Undo/Redo System
// Apple HIG: Every destructive action must be undoable.
// Describe operations clearly: "Undo Move Cube"
// ============================================================

export interface Command {
  /** Human-readable label, e.g. "Move Cube", "Delete Sphere" */
  label: string;
  /** Execute (or re-execute) the command */
  execute: () => void;
  /** Reverse the command */
  undo: () => void;
}

const MAX_STACK_SIZE = 100;

class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  /** Execute a command and push it onto the undo stack */
  execute(cmd: Command) {
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_STACK_SIZE) {
      this.undoStack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
    this.notify();
  }

  /** Undo the last command */
  undo(): string | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.notify();
    return cmd.label;
  }

  /** Redo the last undone command */
  redo(): string | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.execute();
    this.undoStack.push(cmd);
    this.notify();
    return cmd.label;
  }

  /** Check if undo/redo is available */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Peek at the next undo/redo label */
  get undoLabel(): string | null {
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1]!.label
      : null;
  }

  get redoLabel(): string | null {
    return this.redoStack.length > 0
      ? this.redoStack[this.redoStack.length - 1]!.label
      : null;
  }

  /** Clear all history */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  /** Subscribe to changes */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

// Singleton
export const commandStack = new CommandStack();
