import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST() {
  // expire: 0 — немедленно протухает кэш по этому тегу
  revalidateTag("planfact", { expire: 0 });
  revalidateTag("amocrm", { expire: 0 });
  return NextResponse.json({ ok: true });
}
