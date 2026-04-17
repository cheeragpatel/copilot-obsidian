import * as React from "react";

export interface AutocompleteItem {
  type: "command" | "agent";
  label: string;
  description: string;
  icon: string;
  value: string;
}

interface AutocompletePopupProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  onHover: (index: number) => void;
  /** id used for aria-controls/aria-activedescendant on the controlling input */
  id?: string;
}

/**
 * Pure presentational autocomplete listbox. The owning component manages
 * the items list and selection index.
 */
export const AutocompletePopup: React.FC<AutocompletePopupProps> = ({
  items,
  selectedIndex,
  onSelect,
  onHover,
  id = "copilot-autocomplete",
}) => {
  if (items.length === 0) return null;

  return (
    <div className="copilot-autocomplete-popup" id={id} role="listbox">
      {items.map((item, i) => {
        const optionId = `${id}-option-${i}`;
        const selected = i === selectedIndex;
        return (
          <div
            key={`${item.type}-${item.value}`}
            id={optionId}
            role="option"
            aria-selected={selected}
            className={`copilot-autocomplete-item ${selected ? "selected" : ""}`}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(i)}
          >
            <span className="copilot-autocomplete-icon">{item.icon}</span>
            <div className="copilot-autocomplete-text">
              <span className="copilot-autocomplete-label">{item.label}</span>
              <span className="copilot-autocomplete-desc">{item.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Helper for callers wiring aria-activedescendant. */
export function autocompleteOptionId(index: number, id = "copilot-autocomplete"): string {
  return `${id}-option-${index}`;
}
