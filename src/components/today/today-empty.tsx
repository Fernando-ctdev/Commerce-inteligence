import Link from "next/link";
import { Home, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import styles from "./today-empty.module.css";

export function TodayEmpty() {
  return (
    <section aria-labelledby="today-title" className={styles.empty}>
      <p className={styles.eyebrow}>Hoje</p>
      <h2 id="today-title">
        <Home aria-hidden="true" className={styles.titleIcon} />
        Seu próximo conteúdo começa aqui.
      </h2>
      <p>
        Adicione um produto para transformar o que você vende em um plano
        claro de gravação.
      </p>
      <Button className="w-fit" nativeButton={false} render={<Link href="/products/new" />} size="lg">
        <Plus aria-hidden="true" />
        Adicionar produto
      </Button>
    </section>
  );
}
