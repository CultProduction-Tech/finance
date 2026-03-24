import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.AMOCRM_BASE_URL || "";
const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN || "";
const PIPELINE_ID = Number(process.env.AMOCRM_PIPELINE_ID || "0");
const ACT_DATE_FIELD_ID = Number(process.env.AMOCRM_ACT_DATE_FIELD_ID || "0");
const PROJECT_STATUS_FIELD_ID = Number(process.env.AMOCRM_PROJECT_STATUS_FIELD_ID || "0");

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const month = searchParams.get("month") || "2026-01";

  const [y, mo] = month.split("-").map(Number);
  const startDate = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const endDate = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const startTs = Math.floor(new Date(startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);

  const params = new URLSearchParams({
    "filter[statuses][0][pipeline_id]": String(PIPELINE_ID),
    "filter[statuses][0][status_id]": "142",
    limit: "50",
    page: "1",
  });

  const res = await fetch(`${BASE_URL}/api/v4/leads?${params}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const data = await res.json();

  const leads = (data._embedded?.leads || []).map((lead: Record<string, unknown>) => {
    const fields = (lead.custom_fields_values as Array<{ field_id: number; field_name: string; values: { value: unknown }[] }>) || [];
    const actDate = fields.find((f) => f.field_id === ACT_DATE_FIELD_ID);
    const projectStatus = fields.find((f) => f.field_id === PROJECT_STATUS_FIELD_ID);
    const actDateTs = Number(actDate?.values?.[0]?.value || 0);
    const actDateStr = actDateTs ? new Date(actDateTs * 1000).toISOString().split("T")[0] : null;
    const inRange = actDateTs >= startTs && actDateTs <= endTs;

    return {
      id: lead.id,
      name: lead.name,
      price: lead.price,
      status: projectStatus?.values?.[0]?.value || "N/A",
      actDate: actDateStr,
      actDateTs,
      inRange,
    };
  });

  return NextResponse.json({
    month,
    startDate,
    endDate,
    totalLeads: leads.length,
    leads,
  });
}
