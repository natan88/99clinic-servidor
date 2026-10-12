/*
 * Controlador das ações da empresa
 */
;(function () {
    "use strict";

    const atendimento = require("src/controller/atendimento/atendimento.js");
    
    function Controller(socket) {
        const Atendimento = new atendimento( socket.user );
        /* ----------------------------- SOCKET -------------------------------*/       

        socket.on('atendimento.buscaAtendimentos', function(where, pagina, fn) {
            Atendimento.buscaAtendimentos( where, pagina || 0 ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        // baixa apenas um atendimento, é passado where e NÃO apenas o ID, 
        // pois além do ID, pode haver outras restrições
        socket.on('atendimento.buscaAtendimento', function(where, fn) {
            Atendimento.buscaAtendimento( where ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        socket.on('atendimento.buscaTotalAtendimentos', function(where, fn) {
            Atendimento.buscaTotalAtendimentos( where ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        /**
         * Retorna estatísticas de atendimento de um profissional em um intervalo de datas
         */
        socket.on('atendimento.buscaEstatisticas', function( datas, fn) {
            Atendimento.buscaEstatisticas( datas ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });
        
        socket.on('atendimento.buscaEstatisticaPaciente', function( pacienteID, fn) {
            Atendimento.buscaEstatisticaPaciente( pacienteID ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });
        
        /**
         * Salva os dados de uma seção do prontuário
         */
        socket.on('atendimento.salvaProntuario', function( atendimentoID, prontuarioID, campos, fn ) {
            Atendimento.salvaProntuario( atendimentoID, prontuarioID, campos ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        /**
         * Retorna respostas salvas para um atendimento X
         * Se passar prontuarioID, retornar apenas respostas para esse prontuário
         * 
         * Apenas se o atendimento estiver em curso (status 4)
         */
        socket.on('atendimento.getRespostasProntuario', function( atendimentoID, prontuarioID, fn ) {
            Atendimento.getRespostasProntuario( atendimentoID, prontuarioID || null ).then((result) => {              
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        /**
         * Retorna o prontuário do paciente (total de atendimentos com prontuário)
         */
        socket.on('atendimento.getTotalProntuarioPaciente', function( pacienteID, fn ) {
            Atendimento.getTotalProntuarioPaciente( pacienteID ).then(( total ) => {
                if( fn ) fn({status: true, result: total });
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        /**
         * Retorna os prontuários que um profissional preencheu de um paciente
         * agrupado por atendimento (apenas atendimentos concluído - status 5)
         */
        socket.on('atendimento.getProntuarioPaciente', function( pacienteID, pagina, fn ) {
            if( !fn ) return;
            let paraImpressao = false; 
            let retornarAnexo = true;
            Atendimento.getProntuarioPaciente( pacienteID, pagina || 1, paraImpressao, retornarAnexo ).then(( result ) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });  

        /**
         * Retorna o protuário de um atendimento já concluído, ou seja, é parte do
         * prontuário do paciente
         */
        socket.on('atendimento.getProntuarioAtendimento', function( atendimentoID, fn ) {
            if( !fn ) return;
            let paraImpressao = false; 
            let retornarAnexo = true;
            let prontuarioID = null;
            Atendimento.getProntuarioAtendimento( atendimentoID, prontuarioID, paraImpressao, retornarAnexo ).then(( result ) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });    

        /**
         * 1ª etapa do envio de arquivos
         */
        socket.on('atendimento.enviaArquivosEtapaUm', function( atendimentoID, dados, fn ) {
            if( !fn || typeof fn !== "function" ) return;
            Atendimento.enviaArquivosEtapaUm( atendimentoID, dados ).then(( result ) => {
                if( fn ) fn({ status: true, result: result });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });    

        socket.on('atendimento.removeAnexo', function( atendimentoID, anexoIdLocal, anexoID, fn ) {
            if( !fn || typeof fn !== "function" ) return;
            Atendimento.removeAnexo( atendimentoID, anexoIdLocal, anexoID ).then(( ) => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });    

        socket.on('atendimento.atualizaNomeDescricaoAnexo', function( dados, fn ) {
            if( !fn || typeof fn !== "function" ) return;
            Atendimento.atualizaNomeDescricaoAnexo( dados ).then(( ) => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });    

        socket.on('atendimento.getAnexosDoAtendimentoEmAndamento', function( atendimentoID, fn ) {
            if( !fn || typeof fn !== "function" ) return;
            Atendimento.getAnexosDoAtendimentoEmAndamento( atendimentoID ).then(( anexos ) => {
                if( fn ) fn({ status: true, anexos: anexos });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

        socket.on('atendimento.getAnexo', function( atendimentoID, anexoID, fn ) {
            if( !fn || typeof fn !== "function" ) return;
            Atendimento.getAnexo( atendimentoID, anexoID ).then(( anexo ) => {
                if( fn ) fn({ status: true, anexo: anexo });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

    }// controller

    exports.controller = Controller;
}());