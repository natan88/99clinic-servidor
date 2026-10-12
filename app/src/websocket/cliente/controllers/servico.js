/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Servico = require("src/controller/servico/servico.js").Servico;


    function Controller(socket) {
        const self = this;
        
        /* ----------------------------- SOCKET -------------------------------*/       
        
 
        socket.on('servico.getServicos', function(fn) {
            Servico.getAll(socket.user.empresa_id).then(function(result){
               fn({status: true, result: result});
            }).catch(function(){
                fn({status: false});
            });
        });
        
        socket.on('servico.add', function(dados, fn) {
            Servico.add(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados).then(function(id){
               fn({status: true, id: id});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('servico.edit', function(dados, fn) {
            Servico.edit(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('servico.del', function(servicoID, fn) {
            Servico.del(socket.user.empresa_id, socket.user.id, socket.user.perfil, servicoID).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erro: erros});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());