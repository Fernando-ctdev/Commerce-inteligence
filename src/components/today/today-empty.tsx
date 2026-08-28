import Link from "next/link";

import { Button } from "@/components/ui/button";
import styles from "./today-empty.module.css";

export function TodayEmpty() {
  return (
    <section aria-labelledby="today-title" className={styles.empty}>
      <p className={styles.eyebrow}>Hoje</p>
      <h2 id="today-title">Seu próximo conteúdo começa aqui.</h2>
      <p>
        Adicione um produto para transformar o que você vende em um plano
        claro de gravação.
      </p>
      <Button className="w-fit" render={<Link href="/products/new" />} size="lg">
        Adicionar produto
      </Button>
    </section>
  );
}
