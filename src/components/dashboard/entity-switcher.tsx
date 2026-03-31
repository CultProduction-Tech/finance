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
            "px-6 py-3 text-sm font-medium transition-colors border-t-2",
            selected === entity.id
              ? "border-t-primary text-foreground bg-background"
              : "border-transparent text-muted-foreground bg-muted/50 hover:bg-muted",
          )}
        >
          {entity.fullName}
        </button>
      ))}
    </div>
  );
}
