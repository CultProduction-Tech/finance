import { NextResponse } from "next/server";

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";

export async function GET() {
  // Получаем список кастомных полей сделок
  const res = await fetch(`${BASE_URL}/api/v4/leads/custom_fields`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.status });
  }

  const data = await res.json();

  // Ищем поля с "бюджет" и "расход" в названии
  const relevant = data._embedded?.custom_fields?.filter(
    (f: { name: string }) =>
      f.name.toLowerCase().includes("бюджет") ||
      f.name.toLowerCase().includes("расход") ||
      f.name.toLowerCase().includes("план")
  );

  return NextResponse.json({
    relevant,
    all: data._embedded?.custom_fields?.map((f: { id: number; name: string; type: string }) => ({
      id: f.id,
      name: f.name,
      type: f.type,
    })),
  });
}
