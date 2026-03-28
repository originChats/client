import { useState } from "preact/hooks";

export interface ContextMenuState<T> {
  data: T;
  x: number;
  y: number;
}

export interface UseContextMenuResult<T> {
  show: (event: MouseEvent, data: T) => void;
  close: () => void;
  state: ContextMenuState<T> | null;
}

export function useContextMenu<T>(): UseContextMenuResult<T> {
  const [state, setState] = useState<ContextMenuState<T> | null>(null);

  const show = (event: MouseEvent, data: T) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ data, x: event.clientX, y: event.clientY });
  };

  const close = () => setState(null);

  return { show, close, state };
}
