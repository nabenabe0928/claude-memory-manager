import { useState } from "react";

export function useSelection<K>() {
  const [selected, setSelected] = useState<Set<K>>(new Set());

  const toggle = (key: K) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (allKeys: K[]) => {
    setSelected((prev) =>
      prev.size === allKeys.length ? new Set() : new Set(allKeys),
    );
  };

  const clear = () => setSelected(new Set());

  const isAllSelected = (allKeys: K[]) =>
    allKeys.length > 0 && selected.size === allKeys.length;

  return { selected, toggle, toggleAll, clear, isAllSelected, count: selected.size };
}
