"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useHintMode } from "@/contexts/hint-mode";
import { cn } from "@/lib/utils";

interface HintProps {
  children: React.ReactNode;
  /** Содержимое подсказки. Можно строку или JSX (для списков, выделений). */
  content: React.ReactNode;
  /** Заголовок подсказки (опционально, жирным сверху). */
  title?: string;
  /** Доп. класс на обёртку триггера. */
  className?: string;
  /** Сторона тултипа. По умолчанию авто (top), base-ui сам перенесёт если не помещается. */
  side?: "top" | "bottom" | "left" | "right";
  /** Показывать независимо от режима «Подсказки». Для тултипов-ДАННЫХ (список сделок,
   *  происхождение числа) — в отличие от подсказок-документации, гейтить их нечестно. */
  always?: boolean;
}

/**
 * Обёртка, которая в "режиме подсказок" (см. HintModeProvider) показывает тултип при наведении.
 * Если режим выключен — рендерит детей как есть, без обёртки (кроме always-тултипов).
 */
export function Hint({ children, content, title, className, side = "top", always = false }: HintProps) {
  const { enabled } = useHintMode();

  if (!enabled && !always) return <>{children}</>;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        render={
          <span
            className={cn(
              "cursor-help",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={8} className="z-50">
          <TooltipPrimitive.Popup
            className={cn(
              "max-w-xs rounded-lg bg-white px-3 py-2 text-[12px] leading-snug text-[#1d1d1f] shadow-lg ring-1 ring-black/10",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
              "data-open:animate-in data-open:fade-in-0 data-open:duration-100",
            )}
          >
            {title && <div className="font-semibold mb-1 text-[12px]">{title}</div>}
            <div className="text-muted-foreground whitespace-pre-line">{content}</div>
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
