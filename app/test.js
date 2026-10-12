/*
 * Inicializa os testes
 * Foi incluído aqui na raiz para poder utulizar o módulo 'app-module-path'
 * Sem 'app-module-path' seria difícil 
 */

;(function () {
    "use strict";
    
    require('app-module-path').addPath(__dirname);// a partir de agora, nao poreciso mais usar global
    require('test/test.prontuario');
    // require('test/test.exemplo-1');
}());
