/**
 * Helper function to parse rubric data from clinical_cases/checklist_rubric
 * Handles both old format (array) and new format (object with enabled/items)
 */
export interface RubricItem {
  text: string;
  points: number;
  isCritical: boolean;
}

export interface RubricData {
  enabled: boolean;
  items: RubricItem[];
}

export default function parseRubricData(raw: any): RubricData {
  // Format baru: { enabled: boolean, items: RubricItem[] }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "enabled" in raw) {
    return {
      enabled: !!raw.enabled,
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    };
  }
  
  // Format lama: array langsung
  if (Array.isArray(raw) && raw.length > 0) {
    return { enabled: true, items: raw.map(normalizeItem) };
  }
  
  return { enabled: false, items: [] };
}

function normalizeItem(item: any): RubricItem {
  if (typeof item === "string") {
    return { text: item, points: 10, isCritical: false };
  }
  
  return {
    text: item.text || item.item_text || String(item),
    points: item.points ?? item.point_value ?? 10,
    isCritical: item.isCritical ?? item.is_critical ?? item.critical ?? false,
  };
}
