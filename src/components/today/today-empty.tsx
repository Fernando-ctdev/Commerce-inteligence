import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import logoMascot from "@/assets/logo/logo_mascot.png";

import { Button } from "@/components/ui/button";
import styles from "./today-empty.module.css";

export function TodayEmpty() {
  return (
    <section aria-labelledby="today-title" className={styles.empty}>
      <p className={styles.eyebrow}>Hoje</p>
      <h2 id="today-title">
        <Image alt="" className={styles.titleLogo} src={logoMascot} />
        <span className={styles.titleText}>Seu próximo conteúdo começa aqui.</span>
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
