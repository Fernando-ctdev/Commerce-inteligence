# Slices Definition

Defina o mapa de slices necessário para o escopo atual antes de iniciar sua implementação.

O escopo pode representar uma primeira entrega, uma nova capacidade, uma evolução de domínio, uma release ou qualquer outro recorte coerente de trabalho.

Um slice é a menor capacidade vertical que entrega comportamento observável e pode ser verificada de ponta a ponta.

Exemplo bom:

> O usuário consegue cadastrar um produto e encontrá-lo novamente.

Exemplos ruins:

- Criar banco;
- Criar API;
- Criar frontend;
- Implementar repository layer.

Infraestrutura deve entrar no primeiro slice que realmente precisar dela.

Defina os slices no nível macro do escopo atual, mas crie SPEC e PLAN somente quando cada slice se tornar o próximo a ser implementado.

O mapa deve apontar de quais PRDs cada requisito veio para facilitar cobertura e rastreabilidade.
