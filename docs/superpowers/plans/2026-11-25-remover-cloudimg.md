# Remover cloudimg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Imagens do prontuário voltam nas telas e no PDF sem o cloudimg.

**Architecture:** O front usa a rota autenticada que já existe; a impressão lê direto do bucket por um módulo pequeno e testável.

**Tech Stack:** Node 10, `@google-cloud/storage` 3.5, pdfmake 0.1.72, AngularJS.

**Spec:** docs/superpowers/specs/2026-11-25-remover-cloudimg-design.md

## Global Constraints
- Sintaxe compatível com Node 10 (sem `?.` nem `??`).
- Sem commit, push ou deploy. Não alterar as mudanças locais do `web_app`.
- Rotas `-cdn` e variáveis de ambiente permanecem.

## Review Focus
- WebP/BMP/arquivo não imagem como anexo: omitido, PDF sai.
- Arquivo ausente no bucket: omitido, PDF sai.
- Content-Type errado no bucket: o tipo vem dos bytes.
- Foto maior que a página: cabe em 535x560.
- Foto de celular com rotação EXIF: pode sair deitada no PDF (sem teste; reportar).

---

### Task 1: Leitura de imagem para o PDF

**Files:** Create `app/src/controller/impressao/impressao-imagem.js`, `app/test/test.impressao.js`

**Interfaces:** Produces `getImagemPDF(bucket, caminho): Promise<string>` (data URL `image/jpeg` ou `image/png`; rejeita nos demais casos).

- [ ] Teste (tape, bucket falso com `file(caminho).download() -> Promise<[Buffer]>`): JPEG vira `data:image/jpeg;base64,`; PNG vira `data:image/png;base64,`; WebP rejeita; download com erro rejeita.
- [ ] `NODE_PATH=app node app/test/test.impressao.js` falha.
- [ ] Implementar detectando os bytes iniciais (`FF D8 FF`, `89 50 4E 47`).
- [ ] Teste passa.

### Task 2: Impressão usa o Storage

**Files:** Modify `app/src/controller/impressao/impressao.js`

**Interfaces:** Consumes `getImagemPDF`.

- [ ] Logo: `${storage.getPastaEmpresa(empresaID)}/${logo}`, com `fit: [80, 80]`.
- [ ] Anexos: `${storage.getPastaProntuario(empresaID, usuario.id)}/${arquivo}`, com `fit: [535, 560]`.
- [ ] Remover os três métodos `getImagemBase64*`/`getLogoEmpresaBase64*` e os imports `request` e `conf`.
- [ ] Verificar: gerar um PDF real com pdfmake a partir de uma imagem grande; `node --check`; sem referências a `imgCdnUrl` no arquivo.

### Task 3: Front usa a rota do servidor

**Files:** `web_app/app/components/consultorio/anexo/{item/consultorio-anexo-item.component.js, ver/consultorio-anexo-ver.component.js, ver/consultorio-anexo-slide.component.js, ver/consultorio-anexo-ver.modal.js}`, `web_app/app/js/app.js`

- [ ] URL: `${URL_HTTP}/arquivo/img/prontuario-anexo/${arquivo}?token=${Token.token}`; injetar `URL_HTTP`/`Token` onde faltar.
- [ ] Remover `CDN_IMG` (injeções e `.value`).
- [ ] Verificar: `node --check` em cada arquivo; `grep -rn "CDN_IMG\|cloudimg" app` vazio.
