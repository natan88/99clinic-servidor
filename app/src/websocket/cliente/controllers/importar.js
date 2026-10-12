/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Importar = require("src/controller/importar/importar.js").Importar;
    


    function Controller(socket) {
        const self = this;
        
        /*------------------------ IMPORTAR clientes --------------------*/
        socket.on('importar.paciente.texto', function(dados, permiteNomesDuplicados, fn) {
            if(socket.user.perfil !== 'a') 
                return fn({status: false, erro: 'Você não tem permissão'});

            Importar.pacientes(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados, permiteNomesDuplicados).then(function(result){
                fn({status: true, result: result});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());