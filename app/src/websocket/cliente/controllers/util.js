/*
 * Controle
 */

/* global exports, module, __base, require */

;(function () {
    "use strict";

    const Util = require("src/controller/util.js").Util;

    function Controller(socket) {       
      
        // verifica se a empresa tem ou não dado de demonstração, para exibir o menur "REMOVER dados de demonstração"
        socket.on('util.hasDemo', (fn) => {
            Util.temDadosDeDemonstracao(socket.user.empresa_id).then( ( tem ) => {
               fn( tem );
            }).catch( ()=> {
                fn( false );
            });
        });

        // Remove os dados de demonstração (cliente, profissionais, atendimentos, etc...)
        socket.on('util.delDemo', (fn) => {
            Util.removeDadosDeDemonstracao(socket.user.empresa_id).then( () => {
               fn( {status: true } );
            }).catch( (erro)=> {
                fn( {status: false, erro: 'Houve um erro interno, por favor tente  novamente ou entre em contato!' } );
            });
        });
        
    }// controller

    exports.controller = Controller;
}());