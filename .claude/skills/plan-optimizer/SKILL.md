---
name: plan-optimizer
description: Roda um loop de auto-melhoria em qualquer plano, texto ou ideia, ate passar num checklist de qualidade. Use quando o usuario pedir pra "deixar otimo", "rodar o loop" ou "melhorar ate ficar bom".
---

# plan-optimizer

Quando o usuario pedir pra otimizar/deixar otimo um conteudo, rode este LOOP
sozinho, sem pedir confirmacao entre as rodadas:

1. EXECUTA   -> produza a melhor primeira versao do material.
2. AVALIA    -> monte um checklist de 6 criterios de qualidade ESPECIFICOS
                pra essa tarefa e de nota 0-10 em cada, com 1 linha de motivo.
3. CRITICA   -> liste os 3 pontos mais fracos e por que estao fracos.
4. REESCREVE -> gere uma nova versao corrigindo esses 3 pontos.
5. REPETE    -> volte ao passo 2 com a nova versao.

CONDICAO DE PARADA: pare quando a nota media passar de 9.0/10 OU quando duas
rodadas seguidas nao melhorarem a media. No maximo 5 rodadas.

SAIDA: mostre apenas a VERSAO FINAL + o placar (criterios e notas) da ultima
rodada. Nao mostre as rodadas intermediarias a menos que o usuario peca.