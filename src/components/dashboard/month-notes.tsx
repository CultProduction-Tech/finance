"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { MONTHS_RU } from "@/types/finance";
import { LegalEntity } from "@/types/finance";

interface MonthNotesProps {
  entity: LegalEntity;
  year: number;
  month: number; // 0-based
}

export function MonthNotes({ entity, year, month }: MonthNotesProps) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = `${MONTHS_RU[month]} ${year}`;

  // Загрузка заметки
  useEffect(() => {
    setLoaded(false);
    fetch(`/api/notes?entity=${entity}&month=${monthKey}`)
      .then((r) => r.json())
      .then((data) => {
        setText(data.text || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [entity, monthKey]);

  // Автосохранение с debounce
  const save = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity, month: monthKey, text: value }),
          });
        } catch {
          // ignore
        }
        setSaving(false);
      }, 800);
    },
    [entity, monthKey],
  );

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(80, el.scrollHeight)}px`;
  }, []);

  useLayoutEffect(() => {
    autoResize();
  }, [text, loaded, autoResize]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    save(value);
    autoResize();
  };

  return (
    <div className="rounded-xl border-0 bg-card/80 backdrop-blur-sm shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">
          &#x1F4DD; Отчет — {label}
        </h3>
        {saving && (
          <span className="text-xs text-muted-foreground">Сохранение...</span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={loaded ? text : ""}
        onChange={handleChange}
        placeholder="Введите отчет и рекомендации за месяц..."
        className="w-full rounded-lg border bg-background/50 p-3 text-sm resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
        style={{ minHeight: 80 }}
      />
    </div>
  );
}
