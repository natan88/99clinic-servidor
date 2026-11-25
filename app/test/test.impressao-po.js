// NODE_PATH=app node app/test/test.impressao-po.js (carrega a configuração do .env)
const test = require('tape'),
    Impressao = require('src/controller/impressao/impressao');

test.onFinish( () => process.exit() ); // a classe de impressão abre conexões ao ser carregada

test('campo de óculos com um olho sem preenchimento não interrompe a impressão', t => {
    const impressao = new Impressao({ id: 1, empresa_id: 1 });
    const campo = { resposta: { perto: { od: { esferico: '1.00' } }, longe: { oe: { eixo: '90' } } } };

    t.doesNotThrow( () => impressao.printCampoPOTabela( campo ) );
    const linhas = impressao.docDefinicao.content[0].table.body;
    t.equal( linhas.length, 5, 'cabeçalho + 2 linhas de perto + 2 de longe' );
    t.equal( linhas[1][2].text, '1.00' );
    t.equal( linhas[4][4].text, '90' );
    t.end();
});
