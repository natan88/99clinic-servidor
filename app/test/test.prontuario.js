/* jshint ignore:start */
;(function () {
    "use strict";

    // http://www.luiztools.com.br/post/tdd-como-criar-unit-tests-em-node-js-com-tape/
    // https://www.node-tap.org/basics/

    const dados = {
        empresaID: 1,
        usuarioID: 95,
        profissionalID: 67
    };
    
    const tap = require('tape'),
    tapSpec = require('tap-spec');
    const prontuario = require('src/controller/prontuario/prontuario.js'),
    Prontuario = new prontuario(dados.empresaID, dados.usuarioID),
    validacao = require('src/controller/prontuario/prontuario-validacao.js');

    
    tap.test('Valida prontuário 1', (t)=> {
        let prontuario = {
            id: 1,
            nome: 'meu prontuário',
            ordem: 2,
            campos: [
                {
                    tipo: 'text',
                    nome: 'Texto',
                    id: 1,
                    ordem: 1
                }
            ]
        };

        return validacao.valida(dados.empresaID, dados.usuarioID, prontuario).then( data => {
            // t.pass('Validou dados com sucesso!');
            // t.end();

            return t.test('Sucesso', (t) => {
                t.equal(2, 2, '2 e 2 são iguais');
                t.end();
            });
        }).catch( err => {
            t.fail('Falhou na validação dos dados: ' + JSON.stringify( err, null, 2 ));
            t.end();
        });
    })
    // .then( (result ) => {
    //     test.equal(1, 1, 'finaliando result: ');
    //     test.end();
    // })
    ;
    //.catch(test.threw)
}());
