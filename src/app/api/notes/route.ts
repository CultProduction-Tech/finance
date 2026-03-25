import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const NOTES_FILE = path.join(process.cwd(), "data", "notes.json");

type NotesData = Record<string, string>; // "blaster:2026-03" → "текст заметки"

async function readNotes(): Promise<NotesData> {
  try {
    const raw = await fs.readFile(NOTES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeNotes(data: NotesData): Promise<void> {
  await fs.mkdir(path.dirname(NOTES_FILE), { recursive: true });
  await fs.writeFile(NOTES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * GET /api/notes?entity=blaster&month=2026-03
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const entity = searchParams.get("entity") || "blaster";
  const month = searchParams.get("month");

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  const notes = await readNotes();
  const key = `${entity}:${month}`;
  return NextResponse.json({ text: notes[key] || "" });
}

/**
 * POST /api/notes { entity, month, text }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { entity = "blaster", month, text } = body;

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 });
  }

  const notes = await readNotes();
  const key = `${entity}:${month}`;

  if (text) {
    notes[key] = text;
  } else {
    delete notes[key];
  }

  await writeNotes(notes);
  return NextResponse.json({ ok: true });
}
