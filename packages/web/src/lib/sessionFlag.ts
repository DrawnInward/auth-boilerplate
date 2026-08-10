// Guarded sessionStorage flag: private-mode or blocked storage degrades to
// "no memory", never a render-breaking throw.

export function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string, value: boolean): void {
  try {
    if (value) {
      sessionStorage.setItem(key, "1");
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // storage unavailable — the flag degrades to in-memory only
  }
}
