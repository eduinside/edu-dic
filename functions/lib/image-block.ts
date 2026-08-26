export async function getBlockedImages(db: D1Database | undefined, word: string): Promise<string[]> {
  if (!db || !word) return [];
  try {
    const rows = await db
      .prepare("SELECT url FROM edudic_blocked_images WHERE word = ?")
      .bind(word)
      .all<{ url: string }>();
    return rows?.results?.map((r) => r.url) ?? [];
  } catch {
    return [];
  }
}

export async function blockImage(db: D1Database | undefined, word: string, url: string): Promise<void> {
  if (!db || !url || !word) return;
  try {
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS edudic_blocked_images (url TEXT PRIMARY KEY, word TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
      )
      .run();
    await db.prepare("INSERT OR IGNORE INTO edudic_blocked_images (url, word) VALUES (?, ?)").bind(url, word).run();
  } catch (err) {
    console.error("blockImage error:", err);
  }
}
