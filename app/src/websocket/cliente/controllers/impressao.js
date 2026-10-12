/*
 * Controle
 */

/* global exports, module, __base, require */

;(function () {
    "use strict";

    const impressao = require("src/controller/impressao/impressao.js");

    function Controller(socket) {
      
        /**
         * Retorna o prontuário do paciente em PDF. Normalmente para ser impresso
         * pela clínica. Opcionalmente vem com os dados completo do paciente
         * DADOS = {imprimirDadosPaciente: true, imprimirColorido: true, pacienteID: 99, atendimentoID: 99 }
         */
        socket.on('impressao.getProntuarioPDF', ( dados, fn) => {
            if( !fn ) return;
            const Impressao = new impressao( socket.user );
            Impressao.getProntuarioPDF( dados )
            .then( ( pdf ) => fn( {status: true, dados: pdf} ) )
            .catch( (erro)=>  {
                fn({status: false, erro: erro });
            } );
        });
        
    }// controller

    exports.controller = Controller;
}());