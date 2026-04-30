"use client";

import { LegalEntity, LEGAL_ENTITIES } from "@/types/finance";
import { cn } from "@/lib/utils";

interface EntitySwitcherProps {
  selected: LegalEntity;
  onSelect: (entity: LegalEntity) => void;
}

export function EntitySwitcher({ selected, onSelect }: EntitySwitcherProps) {
  return (
    <div className="flex">
      {LEGAL_ENTITIES.map((entity) => (
        <button
          key={entity.id}
          onClick={() => onSelect(entity.id)}
          className={cn(
            "px-6 py-3 text-[13px] font-medium transition-all border-b-2 flex items-center gap-2",
            selected === entity.id
              ? "border-b-[var(--accent-solid)] text-foreground"
              : "border-transparent text-[#86868b] hover:text-foreground",
          )}
        >
          <img
            src={`/logos/${entity.id}.jpg`}
            alt=""
            className={cn(
              "w-5 h-5 rounded-md object-cover transition-opacity",
              selected === entity.id ? "opacity-100" : "opacity-50",
            )}
          />
          {entity.fullName}
        </button>
      ))}
    </div>
  );
}
