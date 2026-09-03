import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import styles from "./section-switcher.module.css";

function SectionSwitcherList({ className, ...props }: React.ComponentProps<typeof TabsList>) {
  return <TabsList className={[styles.list, className].filter(Boolean).join(" ")} variant="line" {...props} />;
}

export {
  TabsContent as SectionSwitcherContent,
  Tabs as SectionSwitcher,
  SectionSwitcherList,
  TabsTrigger as SectionSwitcherTrigger,
};
