/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Financeiro = require("src/controller/financeiro.js").Financeiro;
    
    function Controller(socket) {
        const self = this;

        socket.on('financeiro.total', function(where, fn) {
            Financeiro.totalRegistros(socket.user.empresa_id, where || null).then(function(total){
               fn(total);
            });
        });
        
        socket.on('financeiro.get', function(where, pagina, ordem, fn) {
            Financeiro.getRegistros(socket.user.empresa_id, where || null, pagina || 0, ordem || null).then(function(registros){
               fn(registros);
            });
        });
        
    }// controller

    exports.controller = Controller;
}());