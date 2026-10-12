/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Cliente = require("src/controller/cliente/cliente.js").Cliente;


    function Controller(socket) {
        const self = this;
        
        /* ----------------------------- SOCKET -------------------------------*/       
        
 
        socket.on('paciente.busca', function(dado, pagina, fn) {
            Cliente.busca(socket.user.empresa_id, dado, pagina).then(function(pacientes){
               fn(pacientes);
            });
        });
        socket.on('paciente.getTotalBusca', function(dado, fn) {
            Cliente.getTotalBusca(socket.user.empresa_id, dado).then(function(total){
                fn(total);
            });
        });
        
        /*
         * Retorna os pacientes
         */
        socket.on('paciente.getPacientes', function(pagina, fn) {
            Cliente.getPacientes(socket.user.empresa_id, pagina).then(function(pacientes){
                fn(pacientes);
            });
        });
        
        socket.on('paciente.getTotalPacientes', function(fn) {
            Cliente.getTotalPacientes(socket.user.empresa_id).then(function(total){
                fn(total);
            });
        });
        
        socket.on('paciente.getPaciente', function(pacienteID, fn) {
            Cliente.getPaciente(socket.user.empresa_id, pacienteID).then(function(paciente){
                fn(paciente);
            });
        });
        
        socket.on('paciente.add', function(dados, permiteNomeDuplicado, fn) {
            Cliente.add(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados, permiteNomeDuplicado || false).then(function(id){
               fn({status: true, id: id});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('paciente.edit', function(dados, permiteNomeDuplicado, fn) {
            Cliente.edit(socket.user.empresa_id, socket.user.id, socket.user.perfil, dados, permiteNomeDuplicado || false).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        
        socket.on('paciente.del', function(pacienteID, fn) {
            Cliente.del(socket.user.empresa_id, socket.user.id, socket.user.perfil, pacienteID).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());