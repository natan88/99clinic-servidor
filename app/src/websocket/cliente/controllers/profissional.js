/*
 * Controlador das ações da empresa
 */

/* global exports, module, __base, require */

;(function () {
    "use strict";

    const Medico = require("src/controller/profissional/profissional").Medico;

    function Controller(socket) {
        const self = this;
        
        /* ----------------------------- SOCKET -------------------------------*/       
        
        socket.on('medico.getMedicos', function(fn) {
            if( !fn ) return;
            Medico.getAll(socket.user.empresa_id, socket.user ).then(function(dados){
               fn({status: true, result: dados});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        // solicita um médido específico
        socket.on('medico.getMedico', function(medicoID, fn) {
            if( !fn ) return;
            Medico.getMedico(socket.user.empresa_id, socket.user, medicoID).then(function(result){
               fn(result);
            });
        });
        
        /*
         * Retorna os médicos que realizam um determinado serviço
         */
        socket.on('medico.getMedicosDoServico', function(servicoID, fn) {
            if( !fn ) return;
            Medico.getMedicosDoServico(socket.user.empresa_id, servicoID).then(function(result){
               fn(result);
            });
        });
        
        socket.on('medico.add', function(dados, fn) {
            if( !fn ) return;
            Medico.add(socket.user.empresa_id, socket.user, dados).then(function(dados){
               fn({status: true, dados: dados});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('medico.edit', function(dados, fn) {
            if( !fn ) return;
            Medico.edit(socket.user.empresa_id, socket.user, dados).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('medico.editHorario', function(medicoID, horarios, fn) {
            if( !fn ) return;
            Medico.editHorario(socket.user.empresa_id, socket.user, medicoID, horarios).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('medico.editConvenio', function(medicoID, convenios, fn) {
            if( !fn ) return;
            Medico.editConvenio(socket.user.empresa_id, socket.user, medicoID, convenios).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('medico.editServico', function(medicoID, servicos, fn) {
            if( !fn ) return;
            Medico.editServico(socket.user.empresa_id, socket.user, medicoID, servicos).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        socket.on('medico.del', function(servicoID, fn) {
            if( !fn ) return;
            Medico.del(socket.user.empresa_id, socket.user.id, socket.user.perfil, servicoID).then(function(){
               fn({status: true});
            }).catch(function(erros){
                fn({status: false, erros: erros});
            });
        });
        
        /**
         * Solicita a URL de autorização de sincronização com a agenda do google
         * Se o usuário já tiver autorizado, retorna informando que não é necessário uma segunda autorização
         * 
         * Etapa 1/2 da autenticação
         */
        socket.on('medico.getUrlAutorizacaoGoogleAgenda', function(fn) {
            if( !fn ) return;
            Medico.getUrlAutorizacaoGoogleAgenda(socket.user.empresa_id, socket.user).then(( url ) =>{
               fn({status: true, url: url});
            }).catch( erros => {
                fn({status: false, erros: erros});
            });
        });

        /**
         * Etapa 2/2 da autenticação
         */
        socket.on('medico.registraAutorizacaoGoogleAgenda', function(code, fn) {
            if( !fn ) return;
            Medico.registraAutorizacaoGoogleAgenda(socket.user.empresa_id, socket.user, code).then(( ) =>{
               fn({status: true});
            }).catch( erros => {
                fn({status: false, erros: erros});
            });
        });

        /**
         * O usuário não quer mais manter o 99Clinic com permissão de atualizar sua agenda
         */
        socket.on('medico.revogaAutorizacaoGoogleAgenda', function(fn) {
            if( !fn ) return;
            Medico.revogaAutorizacaoGoogleAgenda(socket.user.empresa_id, socket.user).then(( ) =>{
               fn({status: true});
            }).catch( erros => {
                fn({status: false, erros: erros});
            });
        });       
        
    }// controller

    exports.controller = Controller;
}());