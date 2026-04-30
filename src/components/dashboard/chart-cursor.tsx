"use client";

import { useCallback } from "react";

/**
 * Кастомный cursor для Recharts BarChart — динамически подстраивает ширину
 * серого хайлайта под реальную ширину баров в наведённой категории (включая
 * групповые/стековые). Рендерит прямоугольник вокруг всех баров в категории,
 * а не на всю ширину категории, как дефолтный cursor.
 */
interface BarCursorProps {
  /** Цвет заливки */
  fill?: string;
  /** Дополнительный отступ по X от краёв бара (px) */
  padding?: number;
  // Recharts прокидывает:
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function BarCursor({
  fill = "rgba(0,0,0,0.05)",
  padding = 3,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
}: BarCursorProps) {
  const setRef = useCallback(
    (rectEl: SVGRectElement | null) => {
      if (!rectEl) return;
      const svg = rectEl.ownerSVGElement;
      if (!svg) return;
      const bars = svg.querySelectorAll<SVGGraphicsElement>(
        ".recharts-bar-rectangle path, .recharts-bar-rectangle rect",
      );
      const categoryLeft = x;
      const categoryRight = x + width;

      let minX = Infinity;
      let maxX = -Infinity;

      bars.forEach((bar) => {
        let bbox: { x: number; width: number } | null = null;
        try {
          const b = bar.getBBox();
          bbox = { x: b.x, width: b.width };
        } catch {
          bbox = null;
        }
        if (!bbox || bbox.width === 0) return;
        const barCx = bbox.x + bbox.width / 2;
        if (barCx >= categoryLeft && barCx <= categoryRight) {
          if (bbox.x < minX) minX = bbox.x;
          if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;
        }
      });

      if (minX === Infinity) return;
      rectEl.setAttribute("x", String(minX - padding));
      rectEl.setAttribute("width", String(maxX - minX + padding * 2));
    },
    [x, width, padding],
  );

  return (
    <rect
      ref={setRef}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      rx={4}
    />
  );
}
