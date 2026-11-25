// NODE_PATH=app node app/test/test.impressao.js
const test = require('tape'),
    { getImagemPDF } = require('src/controller/impressao/impressao-imagem');

const bucketCom = ( resultado ) => ({
    file: () => ({
        download: () => resultado instanceof Error ? Promise.reject( resultado ) : Promise.resolve([ resultado ])
    })
});

const jpeg = Buffer.from([ 0xFF, 0xD8, 0xFF, 0xE0, 0x00 ]),
    png = Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A ]),
    webp = Buffer.from('RIFF0000WEBP');

test('JPEG e PNG viram data URL, com o tipo obtido pelos bytes', t => {
    Promise.all([ getImagemPDF( bucketCom( jpeg ), 'a.png' ), getImagemPDF( bucketCom( png ), 'b.jpg' ) ])
        .then( ([ a, b ]) => {
            t.equal( a, 'data:image/jpeg;base64,' + jpeg.toString('base64') );
            t.equal( b, 'data:image/png;base64,' + png.toString('base64') );
            t.end();
        }).catch( t.end );
});

test('formato não suportado pelo PDF é rejeitado', t => {
    getImagemPDF( bucketCom( webp ), 'c.webp' )
        .then( () => t.end('deveria rejeitar') )
        .catch( () => { t.pass('rejeitou'); t.end(); });
});

test('falha de leitura no bucket é rejeitada', t => {
    getImagemPDF( bucketCom( new Error('404') ), 'd.jpg' )
        .then( () => t.end('deveria rejeitar') )
        .catch( () => { t.pass('rejeitou'); t.end(); });
});
