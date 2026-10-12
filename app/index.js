/*
 * Inicializa os módulos
 */

;(function () {
    "use strict";
    require('app-module-path').addPath(__dirname);// a partir de agora, nao poreciso mais usar global
    const UsuariosOnline = require('src/util/usuariosOnline.js');

    require('src/web');
    require('src/websocket');
    require('src/eventos');

    // evita que a aplicação pare se econtrar um erro,
    // dessa forma, apenas lançamos o erro no console e a aplicação continua
    // ESSA não é uma boa prática
    process.on('uncaughtException', (err) => {
        console.log('\n-> ERRO PROCESS WS: ', err.stack || err.message);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.log('\n-> Unhandled Rejection at:', reason, " | ", promise);
    });

    UsuariosOnline.limpaDadosAntigos();
}());
