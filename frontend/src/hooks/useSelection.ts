import { useCallback, useState } from "react";

export function useSelection<K>() {
  const [selected, setSelected] = useState<Set<K>>(new Set());

  const toggle = useCallback((key: K) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((allKeys: K[]) => {
    setSelected((prev) =>
      prev.size === allKeys.length ? new Set() : new Set(allKeys),
    );
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isAllSelected = (allKeys: K[]) =>
    allKeys.length > 0 && selected.size === allKeys.length;

  return { selected, toggle, toggleAll, clear, isAllSelected, count: selected.size };
}
