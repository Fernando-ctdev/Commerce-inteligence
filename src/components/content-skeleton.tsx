import { Skeleton } from "@/components/ui/skeleton";

import styles from "./content-skeleton.module.css";

export function ContentSkeleton() {
  return (
    <div aria-busy="true" className={styles.region}>
      <span className={styles.srOnly}>Carregando…</span>
      <Skeleton className={styles.line} />
      <div className={styles.grid}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className={styles.card} key={index} />
        ))}
      </div>
    </div>
  );
}
