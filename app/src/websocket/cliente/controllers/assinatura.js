/*
 * Controlador das ações da empresa
 */
;(function () {
    "use strict";

    const assinatura = require("src/controller/assinatura/assinatura.js");
    
    function Controller(socket) {
        const Assinatura = new assinatura( socket.user );
        /* ----------------------------- SOCKET -------------------------------*/       

        socket.on('assinatura.assinar', ( dados, fn ) => {
            if( !fn ) return;
            Assinatura.assinar( dados ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        socket.on('assinatura.getSituacaoAssinatura', ( fn ) => {
            if( !fn ) return;
            Assinatura.situacaoAssinatura( ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        socket.on('assinatura.getAssinatura', ( fn ) => {
            if( !fn ) return;
            Assinatura.getAssinatura( ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        socket.on('assinatura.getFaturas', ( fn ) => {
            if( !fn ) return;
            Assinatura.getFaturas( ).then((result) => {
                if( fn ) fn({status: true, result: result});
            }).catch((err) =>{
                if( fn ) fn({status: false, erro: err});
            });
        });

        socket.on('assinatura.alterarEndereco', ( endereco, fn ) => {
            if( !fn ) return;
            Assinatura.alteraEnderecoCobranca( endereco ).then(() => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

        socket.on('assinatura.alterarDados', ( dados, fn ) => {
            if( !fn ) return;
            Assinatura.alteraDados( dados ).then(() => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

        socket.on('assinatura.alterarProfissionais', ( dados, fn ) => {
            if( !fn ) return;
            Assinatura.alterarProfissionais( dados ).then(() => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

        // Cancela assinatura do plano PRÓ, volta para o GRÁTIS
        socket.on('assinatura.ancelar', ( motivoCancelamento, fn ) => {
            if( !fn ) return;
            Assinatura.cancelar( motivoCancelamento ).then(() => {
                if( fn ) fn({ status: true });
            }).catch((err) =>{
                if( fn ) fn({ status: false, erro: err });
            });
        });

    }// controller

    exports.controller = Controller;
}());