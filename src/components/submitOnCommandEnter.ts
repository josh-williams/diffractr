import type { KeyboardEvent } from "react";

export function submitOnCommandEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" || !event.metaKey || event.nativeEvent.isComposing)
    return;

  event.preventDefault();
  event.stopPropagation();

  if (event.repeat) return;

  const button = event.currentTarget.querySelector<HTMLButtonElement>(
    "button[data-shortcut-submit]",
  );

  if (button && !button.disabled) button.click();
}
