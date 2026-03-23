"use client";

import { LegalEntity, LEGAL_ENTITIES } from "@/types/finance";
import { cn } from "@/lib/utils";

interface EntitySwitcherProps {
  selected: LegalEntity;
  onSelect: (entity: LegalEntity) => void;
}

export function EntitySwitcher({ selected, onSelect }: EntitySwitcherProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {LEGAL_ENTITIES.map((entity) => (
        <button
          key={entity.id}
          onClick={() => entity.id !== "cult" && onSelect(entity.id)}
          disabled={entity.id === "cult"}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            entity.id === "cult"
              ? "text-muted-foreground/50 cursor-not-allowed"
              : selected === entity.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
          )}
        >
          {entity.fullName}
        </button>
      ))}
    </div>
  );
}
