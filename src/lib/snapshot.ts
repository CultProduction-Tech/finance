import { promises as fs } from "fs";
import path from "path";

/**
 * Файловые снапшоты ответов API — «снимок» данных для мгновенной загрузки.
 *
 * Тот же паттерн хранения, что у data/notes.json: плоские JSON-файлы в data/,
 * никаких внешних хранилищ. Запись атомарная (tmp + rename), чтобы читатель
 * никогда не увидел полфайла.
 *
 * data/snapshots/ должен быть в .gitignore — это рантайм-данные, не код.
 */

const SNAPSHOT_DIR = path.join(process.cwd(), "data", "snapshots");

export interface Snapshot<T> {
  /** ISO-время создания снимка (серверное) */
  snapshotAt: string;
  payload: T;
}

/** Ключ → безопасное имя файла */
function fileFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SNAPSHOT_DIR, `${safe}.json`);
}

export async function saveSnapshot<T>(key: string, payload: T): Promise<void> {
  try {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    const file = fileFor(key);
    const tmp = `${file}.tmp`;
    const body: Snapshot<T> = { snapshotAt: new Date().toISOString(), payload };
    await fs.writeFile(tmp, JSON.stringify(body), "utf-8");
    await fs.rename(tmp, file);
  } catch (err) {
    // Снапшот — вспомогательный слой: его отказ не должен ломать основной ответ.
    console.warn(`Snapshot save failed (${key}):`, err);
  }
}

export async function readSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  try {
    const raw = await fs.readFile(fileFor(key), "utf-8");
    return JSON.parse(raw) as Snapshot<T>;
  } catch {
    return null;
  }
}
