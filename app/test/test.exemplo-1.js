/* jshint ignore:start */
;(function () {
    "use strict";

    const test = require('tape'),
    tapSpec = require('tap-spec');

    
    // --------- EXEMPLOS PARA ENTENDIMENTOS -----------

    test('Aplicar desconto', (t) => {
        t.assert(5 === 5, "Descontou corretamente: ");
        t.end();
    });

    test('Aplicar acrescimo', (t) => {
        t.equal(1, 1, 'sim, são iguais');
        t.end();
    });

    test('Passou com louvor', (t) => {
        t.pass('Está tudo por aqui');
        t.end();
    });


}());
