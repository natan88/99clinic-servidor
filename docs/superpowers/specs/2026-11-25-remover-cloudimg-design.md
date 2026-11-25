# Remover o cloudimg (desenho curto, aprovado em 2026-11-25)

## Intenção
O cloudimg bloqueou a conta (fim do plano grátis). Restaurar as imagens do prontuário nas telas e no PDF sem depender de serviço externo. Solução definitiva, não paliativa.

Volume informado pela consulta no banco: 79 imagens nos 12 meses com envio, cerca de 39 MB, média de 500 KB, maior com 7,1 MB.

## Objetivos
- Miniaturas, galeria e visualização voltam a funcionar no `web_app`.
- O PDF volta a sair com a logo e os anexos, lidos direto do Google Storage.

## Não objetivos
- CDN, miniaturas no servidor, redução no upload, URLs montadas pelo backend.

## Restrições
- Node 10; bucket continua privado.
- `web_app` tem mudanças locais (localhost) que não podem ser alteradas nem commitadas.
- Sem commit, push ou deploy sem pedido.

## Abordagens consideradas
1. **Rotas autenticadas do próprio servidor (escolhida):** menor mudança, sem terceiros; entrega os originais.
2. **ImageKit com URLs assinadas:** miniaturas leves, mas exige conta, chave e depende de outro plano grátis.
3. **Miniaturas geradas no upload:** telas leves, mas exige biblioteca para Node 10 e conversão dos antigos.

## Como
- Front: 4 componentes usam `URL_HTTP/arquivo/img/prontuario-anexo/{arquivo}?token=`; `CDN_IMG` é removido.
- Impressão: baixar via `storage.getBucket()`; imagens com `fit` na página; formato não suportado pelo pdfmake (WebP, BMP) ou falha de leitura é omitido sem derrubar o PDF.
- Depois de validar em produção (fora desta entrega): remover rotas `-cdn`, `authCDN`, `CLOUDIMG_URL` e `AUTH_IMG_CDN`.
