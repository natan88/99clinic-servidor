/*
 * Faz o aperto de mão
 */
;(function () {
    "use strict";

    const Login = require("src/admin/autenticacao.js");

    function apertoDeMao(socket, next){
        let query = socket.handshake.query;
        Login.apertoDeMao(query.token).then( function( user ){
            if(user){
                socket.user = {
                    id: user.id,
                    nome: user.nome,
                    token: query.token
                };
                return next();
            }else{
                return next(new Error('unauthorized'));
                //socket.disconnect();// se usar isso, a aplicação não captura o erro
            }
        }).catch( function( erro){
            return next(new Error('unauthorized'));
        });
    }

    exports.apertoDeMao = apertoDeMao;
}());