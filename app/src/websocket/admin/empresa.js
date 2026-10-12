/*
 * Controlador das ações da empresa
 */

;(function () {
    "use strict";

    const Empresa = require("src/admin/empresa.js");


    function Controller(socket) {
        
        /* 
         * Busca empresa
         */
        socket.on('empresa.getEmpresas', ( where, pagina, fn) => {
            if( !fn ) return;
            Empresa.buscaEmpresas( where, pagina ).then( (empresas) => {
                fn({status: true, result: empresas});
            }).catch((erro) =>{
                fn({status: false, erro: erro});
            });
        });


        socket.on('empresa.getTotal', ( where, fn) => {
            if( !fn ) return;
            Empresa.buscaTotalEmpresas( where ).then( ( total ) => {
                fn({status: true, result: total});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        socket.on('empresa.getEmpresa', ( empresaID, fn) => {
            if( !fn ) return;
            Empresa.buscaEmpresaByID( empresaID ).then( ( empresa ) => {
                fn({status: true, result: empresa});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        // retorna dados complementares sobre a empresa, como profissionais e serviços
        socket.on('empresa.getDetalhesEmpresa', ( empresaID, fn) => {
            if( !fn ) return;
            Empresa.getDetalhesEmpresa( empresaID ).then( ( dados ) => {
                fn({status: true, result: dados});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });

        /**
         * Edita a observação interna sobre uma empresa
         * Essa nota não é visível para a empresa, apenas internamete pela equipe
         * 99Cliic
         */
        socket.on('empresa.editObservacaoEmpresa', ( empresaID, obs, fn) => {
            if( !fn ) return;
            Empresa.editObservacaoEmpresa( empresaID, obs ).then( ( ) => {
                fn({status: true});
            }).catch(( erro ) =>{
                fn({status: false, erro: erro});
            });
        });
        
    }// controller

    exports.controller = Controller;
}());