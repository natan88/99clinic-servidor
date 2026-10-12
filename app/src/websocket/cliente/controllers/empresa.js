/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Empresa = require("src/controller/conta/empresa.js").Empresa;


    function Controller(socket) {
        const self = this;
        
        /* ----------------------------- SOCKET -------------------------------*/       
        
        /* 
         */
        socket.on('empresa.get', function(fn) {
            Empresa.getEmpresa(socket.user.empresa_id, socket.user.id).then(function(empresa){
               fn({status: true, result: empresa});
            }).catch(function(){
                fn({status: false});
            });
        });
        
        socket.on('empresa.edit', function(dados, fn) {
            Empresa.edit(socket.user.empresa_id, socket.user.perfil, dados).then(function(){
               fn({status: true});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });
        
        socket.on('empresa.removeLogo', function(fn) {
            Empresa.removeLogo(socket.user.empresa_id, socket.user).then(function(dados){
               fn({status: true, dados: dados});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });
        
        socket.on('empresa.dashboard', function(data, fn) {
            if(socket.user.perfil != 'a') return fn({status: false, erros: 'Sem permissão'});
            Empresa.dashboard(socket.user.empresa_id, data).then(function(dados){
               fn({status: true, dados: dados});
            }).catch(function(erro){
                fn({status: false, erros: erro});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());