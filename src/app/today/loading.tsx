import { TodayEmpty } from "@/components/today/today-empty";
import { ProductShell } from "@/components/products/product-shell";

/* A Home vazia é estática: espelhá-la 1:1 elimina a troca brusca de layout. */
export default function TodayLoading() {
  return (
    <ProductShell active="home" title="Bem vindo!">
      <TodayEmpty />
    </ProductShell>
  );
}
