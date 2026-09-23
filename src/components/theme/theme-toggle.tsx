"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const THEME_STORAGE_KEY = "ci-theme";
export const THEME_CHANGE_EVENT = "ci-theme-change";

export function applyThemePreference(next: "light" | "dark") {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Preferência é local ao dispositivo; falha de storage não bloqueia a troca.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    };
    const frame = window.requestAnimationFrame(() => {
      syncTheme();
    });
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
    };
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Mudar para tema ${nextTheme === "dark" ? "escuro" : "claro"}`;
  const Icon = nextTheme === "dark" ? Moon : Sun;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={() => {
              setTheme(nextTheme);
              applyThemePreference(nextTheme);
            }}
            size="icon"
            variant="ghost"
          />
        }
      >
        <Icon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
