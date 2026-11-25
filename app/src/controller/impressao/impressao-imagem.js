/**
 * Lê uma imagem do Google Storage no formato aceito pelo pdfmake
 */
{
    "use strict";

    // o pdfmake aceita apenas JPEG e PNG; o tipo é identificado pelos primeiros bytes
    const assinaturas = [
        { tipo: 'image/jpeg', bytes: Buffer.from([ 0xFF, 0xD8, 0xFF ]) },
        { tipo: 'image/png', bytes: Buffer.from([ 0x89, 0x50, 0x4E, 0x47 ]) }
    ];

    /**
     * @param {Object} bucket bucket do Google Storage
     * @param {String} caminho caminho completo do arquivo no bucket
     * @returns {Promise<String>} data URL da imagem
     */
    const getImagemPDF = ( bucket, caminho ) => {
        return bucket.file( caminho ).download().then( ([ conteudo ]) => {
            const formato = assinaturas.find( a => conteudo.slice( 0, a.bytes.length ).equals( a.bytes ) );
            if( !formato ) throw new Error('formato de imagem não suportado');

            return `data:${formato.tipo};base64,` + conteudo.toString('base64');
        });
    };

    module.exports = { getImagemPDF };
}
