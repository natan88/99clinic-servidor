/* jshint ignore:start */
;(function () {
    "use strict";

    require('app-module-path').addPath('../');// para permitir que os arquivos sejam incluidos corretamente
    const test = require('tape'),
    Empresa = require('../src/controller/conta/empresa').Empresa;

    // Logo removida com sucesso
    test.test('Remove logo da empresa', ( testFilho  )=> {
        let user = {
            perfil: 'a'
        };
        let empresaID = 1;

        Empresa.removeLogo( empresaID, user)
        .then( data => {
            testFilho.pass('Logo removida com sucesso!');
            testFilho.end();
        }).catch( err => {
            testFilho.fail('Falhou ao remover logo da empresa: ' + JSON.stringify( err, null, 2 ));
            testFilho.end();
        });
    });

    // Não pode remover logo da empresa, o usuário não é administrador
    // test.test('Remove logo da empresa - nao ADM', ( testFilho  )=> {
    //     let user = {
    //         perfil: 's'
    //     };
    //     let empresaID = 2;

    //     return Empresa.removeLogo( empresaID, user)
    //     .then( data => {
    //         testFilho.pass('Logo removida com sucesso!');
    //         testFilho.end();
    //     }).catch( err => {
    //         testFilho.fail('Falhou ao remover logo da empresa: ' + JSON.stringify( err, null, 2 ));
    //         testFilho.end();
    //     });
    // });

    // // Não pode remover logo da empresa, o usuário não é administrador
    // test.test('Remove logo empresa - arquivo nao existe', ( testFilho  )=> {
    //     let user = {
    //         perfil: 'a'
    //     };
    //     let empresaID = 5;

    //     return Empresa.removeLogo( empresaID, user)
    //     .then( data => {
    //         testFilho.pass('Logo removida com sucesso!');
    //         testFilho.end();
    //     }).catch( err => {
    //         testFilho.fail('Falhou ao remover logo da empresa: ' + JSON.stringify( err, null, 2 ));
    //         testFilho.end();
    //     });
    // });

}());
