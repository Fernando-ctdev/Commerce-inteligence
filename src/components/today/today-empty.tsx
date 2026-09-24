"use client";

import Image from "next/image";

import logoMascot from "@/assets/logo/logo_mascot.png";

import { ProductCreateTrigger } from "@/components/products/create/product-create-overlay";
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
      <ProductCreateTrigger className="w-fit" size="lg" />
    </section>
  );
}
