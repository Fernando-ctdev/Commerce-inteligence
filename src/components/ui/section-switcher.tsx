"use client";

import { createContext, useContext, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./section-switcher.module.css";

type SectionSwitcherContextValue = {
  activeValue: string;
  setActiveValue: (value: string) => void;
  listId: string;
};

const SectionSwitcherContext = createContext<SectionSwitcherContextValue | null>(null);

function useSectionSwitcher() {
  const context = useContext(SectionSwitcherContext);
  if (!context) throw new Error("SectionSwitcher components must be nested in SectionSwitcher.");
  return context;
}

export function SectionSwitcher({ children, className, defaultValue = "", onValueChange, value, "aria-label": ariaLabel }: { children: ReactNode; className?: string; defaultValue?: string; onValueChange?: (value: string) => void; value?: string; "aria-label"?: string }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = value ?? internalValue;
  const listId = useId();
  const setActiveValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };
  return <SectionSwitcherContext.Provider value={{ activeValue, listId, setActiveValue }}><div aria-label={ariaLabel} className={[styles.root, className].filter(Boolean).join(" ")}>{children}</div></SectionSwitcherContext.Provider>;
}

export function SectionSwitcherList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const { listId } = useSectionSwitcher();
  return <div aria-label={label} aria-orientation="horizontal" className={[styles.list, className].filter(Boolean).join(" ")} id={listId} role="tablist">{children}</div>;
}

export function SectionSwitcherTrigger({ children, value }: { children: ReactNode; value: string }) {
  const { activeValue, listId, setActiveValue } = useSectionSwitcher();
  const selected = activeValue === value;
  const tabId = `${listId}-${value}`;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
    const index = tabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (index < 0 || nextIndex < 0) return;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };
  return <button aria-controls={`${tabId}-panel`} aria-selected={selected} className={[styles.trigger, selected ? styles.selected : ""].filter(Boolean).join(" ")} id={tabId} onClick={() => setActiveValue(value)} onKeyDown={onKeyDown} role="tab" tabIndex={selected ? 0 : -1} type="button">{children}</button>;
}

export function SectionSwitcherContent({ children, className, value }: { children: ReactNode; className?: string; value: string }) {
  const { activeValue, listId } = useSectionSwitcher();
  const tabId = `${listId}-${value}`;
  return <div aria-labelledby={tabId} className={className} hidden={activeValue !== value} id={`${tabId}-panel`} role="tabpanel" tabIndex={0}>{children}</div>;
}
