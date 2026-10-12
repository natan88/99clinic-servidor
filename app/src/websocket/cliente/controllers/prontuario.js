;(function () {
    "use strict";

    const prontuario = require( 'src/controller/prontuario/prontuario.js');
        
    function Controller(socket) {
        const Prontuario = new prontuario(socket.user.empresa_id, socket.user);

        // retorna a definição do prontuário do profissional logado (todas as seções)
        socket.on('prontuario.getProntuariosAsync', (fn)=> {
            Prontuario.getProntuariosAsync( socket );
        });

        // retorna todos os campos de um prontuário, de um médido
        socket.on('prontuario.getCamposProntuario', (prontuarioID, fn)=> {
            Prontuario.getCamposProntuario( prontuarioID )
            .then( prontuarios => fn(prontuarios) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        // o profissional adiciona uma guia do prontuário, com todos os campos
        socket.on('prontuario.addProntuario', ( dados, fn)=> {
            Prontuario.add( dados )
            .then( prontuarios => fn({status: true, result: prontuarios}) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        socket.on('prontuario.editProntuario', ( dados, fn)=> {
            Prontuario.edit( dados )
            .then( prontuarios => fn({status: true, result: prontuarios}) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        socket.on('prontuario.delProntuario', ( prontuarioID, fn)=> {
            Prontuario.del( prontuarioID )
            .then( () => fn({status: true }) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        socket.on('prontuario.ativaInativaProntuario', ( prontuarioID, status, fn)=> {
            Prontuario.ativaInativa( prontuarioID, status )
            .then( () => fn({status: true }) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        /**
         * Altera a ordem das seções do prontuário
         */
        socket.on('prontuario.ordenaProntuarios', ( prontuariosID, fn)=> {
            Prontuario.ordenar( prontuariosID )
            .then( () => fn({status: true }) )
            .catch( erros => fn({status: false, erros: erros}) );
        });

        /**
         * Atualiza o(s) modelo(s) de um campo de texto longo
         */
        socket.on('prontuario.salvaModelosDeCampo', ( prontuarioID, campoID, modelos, fn)=> {
            if( !fn ) return;
            Prontuario.salvaModelosDeCampo( prontuarioID, campoID, modelos )
            .then( () => fn({status: true }) )
            .catch( erros => fn({status: false, erros: erros}) );
        });
               
    }// controller


    exports.controller = Controller;
}());