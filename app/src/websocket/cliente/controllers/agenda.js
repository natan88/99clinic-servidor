/*
 * Controlador das ações da empresa
 */
;(function () {
    "use strict";

    const Agenda = require("src/controller/agenda/agenda.js").Agenda;
    
    function Controller(socket) {
        const self = this;
        /* ----------------------------- SOCKET -------------------------------*/       
        
        /*
         * Retorna os médicos que realizam um determinado serviço
         */
        socket.on('agenda.getHorariosLivres', function(servicoID, medicoID, dataInicial, fn) {
            Agenda.getHorariosLivres(socket.user.empresa_id, servicoID || null, medicoID || null, dataInicial || null).then(function(result){
               fn({status: true, horarios: result});
            }).catch(function(err){
                fn({status: false, erro: err});
            });
        });
        
        socket.on('agenda.getHorariosData', function(servicoID, medicoID, data, fn) {
            Agenda.getHorariosData(socket.user.empresa_id, servicoID || null, medicoID || null, data || null).then(function(result){
               fn({status: true, horarios: result});
            }).catch(function(err){
                fn({status: false, erro: err});
            });
        });
        
        //servicoID, medicoID, clienteID, data, status, convenioID
        socket.on('agenda.agendar', function(agenda, fn) {
            Agenda.agendar(socket.user.empresa_id, socket.user.id, agenda).then(function(id){
               fn({status: true, id: id});
            }).catch(function(err){
                fn({status: false, erros: err});
            });
        });
        
        // solicita os atendimentos do dia corrente
        socket.on('agenda.getAtendimentosDia', function( data, fn ) {
            if( !fn ) return;
            Agenda.getAtendimentosDia(socket.user.empresa_id, data, socket.user).then( ( agendas ) => {
                fn({ status: true, agendas: agendas });
            }).catch( ( erro ) => {
                fn({ status: false, erro: erro });
            });
        });
        
        /* 
         * solicita uma agenda do dia. A diferença para a função acima é que 
         * recebe uma agenda apenas
         * 
         * Para manter os atendimentos sincronizados
         */
        socket.on('agenda.getAtendimentoDia', function(atendimentoID, profissionalID, data, fn) {
            if( !fn ) return;
            Agenda.getAtendimentoDia(socket.user.empresa_id, socket.user, atendimentoID, profissionalID, data).then(function(agenda){
               fn(agenda);
            });
        });
        
        socket.on('agenda.atendimentosDia.ordenar', function(profissionalID, ordens) {
            Agenda.ordenarAgendaDia(socket.user.empresa_id, profissionalID, ordens);
        });
        
        /*
         * Muda status de um atendimento
         */
        socket.on('agenda.mudaStatusAtendimento', function(atendimentoID, status, obs, fn) {
            Agenda.mudaStatusAtendimento(socket.user.empresa_id, socket.user, atendimentoID, status, obs).then( () => {
                if( fn ) fn({status: true});
            }).catch( (err) => {
                if( fn ) fn({status: false, erros: err});
            });
        });
        /*
         * Cancela um atendimento, ou seja, altera do status EM ATENDIMENTO para 
         * o status imediatamente anterior
         */
        socket.on('agenda.cancelaAtendimentoEmCurso', function(atendimentoID, preservarProntuario, obs, fn) {
            Agenda.cancelaAtendimentoEmCurso(socket.user.empresa_id, socket.user, atendimentoID, obs, preservarProntuario).then( (novoStatus) => {
                fn({status: true, novoStatus: novoStatus});
            }).catch( (err) => {
                if( fn ) fn({status: false, erros: err});
            });
        });

        socket.on('agenda.concluiAtendimento', function(atendimentoID, fn) {
            Agenda.concluiAtendimento(socket.user, atendimentoID ).then( () => {
                fn({status: true});
            }).catch( (err) => {
                if( fn ) fn({status: false, erros: err});
            });
        });

        socket.on('agenda.iniciaAtendimento', function(atendimentoID, fn) {
            Agenda.iniciaAtendimento(socket.user, atendimentoID ).then( () => {
                fn({status: true});
            }).catch( (err) => {
                if( fn ) fn({status: false, erros: err});
            });
        });
        
        socket.on('agenda.informaPagamento', function(atendimentoID, pagamento, fn) {
            Agenda.informaPagamento(socket.user.empresa_id, atendimentoID, pagamento).then(() => {
               fn({status: true});
            }).catch(function(err){
                fn({status: false, erros: err});
            });
        });
        
        /*
         * Atualiza os dados básicos de um atendimento como: data, hora, obs, 
         * convenio
         */
        socket.on('agenda.edit', function(atendimentoID, dados, fn) {
            Agenda.editAtendimento(socket.user, atendimentoID, dados).then(function(){
               fn({status: true});
            }).catch(function(err){
                fn({status: false, erros: err});
            });
        });
        
        // para o dashboard
        socket.on('agenda.ultimosAtendimentos', function(fn) {
            Agenda.ultimosAtendimentos(socket.user.empresa_id, socket.user).then(function(result){
               fn(result);
            });
        });
        
        /*------------------------- ATENDIMENTOS --------------------*/
        socket.on('agenda.totalAtendimentos', function(where, fn) {
            Agenda.totalAtendimentos(socket.user.empresa_id, socket.user, where || null).then(function(total){
               fn(total);
            });
        });
        
        socket.on('agenda.getAtendimentos', function(where, pagina, ordem, fn) {
            Agenda.getAtendimentos(socket.user.empresa_id, socket.user, where || null, pagina || 0, ordem || null).then(function(atendimentos){
               fn(atendimentos);
            });
        });
        
        socket.on('agenda.getAtendimento', function(atendimentoID, fn) {
            Agenda.getAtendimento(socket.user.empresa_id, socket.user, atendimentoID).then(function(atendimento){
               fn(atendimento);
            });
        });
        
        // diz se o cliente prefere ser atendido por um profissional ou se não faz questão que seja um profissional específico
        socket.on('agenda.mudaPreferenciaProfissional', function(atendimentoID, status) {
            Agenda.mudaPreferenciaProfissional(socket.user.empresa_id, atendimentoID, status);
        });
    }// controller

    exports.controller = Controller;
}());