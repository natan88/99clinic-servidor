/*
 * Faz o aperto de mão
 */
;(function () {
    "use strict";

    const Login = require("src/controller/conta/autenticacao.js").Autenticacao;

    function apertoDeMao(socket, next){
        let query = socket.handshake.query;
        let userAgent = socket.handshake.headers['user-agent'];
        let origin = socket.handshake.headers.origin;

        Login.apertoDeMao(query.token, userAgent, origin ).then( function( user ){
            if(user){
                socket.user = {
                    id: user.id,
                    perfil: user.perfil,
                    empresa_id: user.empresa_id,
                    token: query.token,
                    loginID: user.loginID,
                    sessaoID: user.sessaoID
                };
                if( user.profissional_id ) socket.user.profissional_id = user.profissional_id;
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