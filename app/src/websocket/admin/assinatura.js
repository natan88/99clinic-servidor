/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Assinatura = require("src/admin/assinatura.js"),
    Fatura = require("src/admin/fatura.js");


    function Controller(socket) {
        // ------------------- ASSINATURA -----------------
        socket.on('assinatura.getAssinaturaVigente', ( empresaID, fn) => {
            if( !fn ) return;
            Assinatura.getAssinaturaVigente( empresaID ).then( ( assinatura ) => {
                fn({status: true, result: assinatura});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('assinatura.alteraStatus', ( dados, fn) => {
            if( !fn ) return;
            Assinatura.alteraStatus( dados ).then( ( ) => {
                fn({status: true });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('assinatura.editObservacaoAssinatura', ( empresaID, assinaturaID, obs, fn) => {
            if( !fn ) return;
            Assinatura.editObservacaoAssinatura( empresaID, assinaturaID, obs ).then( ( ) => {
                fn({status: true});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });


        // ------------------- FATURA -----------------

        socket.on('fatura.getFaturas', ( empresaID, assinaturaID, fn) => {
            if( !fn ) return;
            Fatura.getFaturasDaAssinatura( empresaID, assinaturaID ).then( ( faturas ) => {
                fn({status: true, result: faturas });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('fatura.getFatura', ( faturaID, fn) => {
            if( !fn ) return;
            Fatura.getFatura( faturaID ).then( ( faturas ) => {
                fn({status: true, result: faturas });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('fatura.editNota', ( faturaID, obs, fn) => {
            if( !fn ) return;
            Fatura.editNota( faturaID, obs ).then( ( ) => {
                fn({status: true });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('fatura.alteraStatus', ( dados, fn) => {
            if( !fn ) return;
            Fatura.alteraStatus( dados ).then( ( ) => {
                fn({status: true });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('fatura.registraPagamento', ( dados, enviaEmailAoCliente, ignorarStatusFatura, fn) => {
            if( !fn ) return;
            Fatura.registraPagamento( dados, enviaEmailAoCliente, ignorarStatusFatura ).then( ( pg ) => {
                fn({status: true, result: pg });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        /**
         * Retorna a lista de profissionais que devem ser faturados em um período
         * 
         * O objetivo é retornar profissionais que usam os recursos PRÓ
         */
        socket.on('fatura.getProfissionaisFaturados', ( assinaturaID, dataIncio, dataFim, fn) => {
            if( !fn ) return;
            Fatura.getProfissionaisFaturados( assinaturaID, dataIncio, dataFim ).then( ( pg ) => {
                fn({status: true, result: pg });
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('fatura.criaFatura', ( dados, fn) => {
            if( !fn ) return;
            Fatura.criaFatura( dados ).then( ( pg ) => {
                fn({status: true, result: pg });
            }).catch(( erro ) => {
                fn({status: false, erro: erro});
            });
        });


        // ------------------- /FATURAS -----------------

        
    }// controller

    exports.controller = Controller;
}());