/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Convenio = require("src/controller/convenio/convenio.js").Convenio;


    function Controller(socket) {
        const self = this;
        
        /* ----------------------------- SOCKET -------------------------------*/       
        
 
        socket.on('convenio.getConvenios', function(fn) {
            Convenio.getAll(socket.user.empresa_id).then(function(convenios){
               fn({status: true, result: convenios});
            }).catch(function(){
                fn({status: false});
            });
        });
        
        socket.on('convenio.add', function(dados, fn) {
            Convenio.add(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados).then(function(id){
               fn({status: true, id: id});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('convenio.edit', function(dados, fn) {
            Convenio.edit(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());