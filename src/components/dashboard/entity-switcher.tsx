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
            "px-6 py-3 text-[13px] font-medium transition-all border-b-2",
            selected === entity.id
              ? "border-b-[#1d1d1f] text-[#1d1d1f]"
              : "border-transparent text-[#86868b] hover:text-[#1d1d1f]",
          )}
        >
          {entity.fullName}
        </button>
      ))}
    </div>
  );
}
