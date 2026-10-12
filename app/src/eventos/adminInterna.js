;(function () {
    "use strict";

    /**
     * Eventos emitidos para ADMINISTRAÇÃO INTERNA da 99Cliic
     * 
     * Aqui ficará
     */

    const 
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on('assinatura.criada', assinaturaCriada)
    .on('assinatura.statusAlterado', assinaturaStatusAlterado)
    .on('assinatura.dadosAlterado', assinaturaDadosAlterado)
    .on('assinatura.enderecoAlterado', assinaturaEnderecoAlterado)
    .on('assinatura.profissionaisAlterados', assinaturaProfissionaisAlterados)

    .on('fatura.criada', faturaCriada)
    .on('fatura.statusAlterado', faturaStatusAlterado)
    ;

    // ------------- ASSINATURA ----------------

    function assinaturaCriada( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_ADMIN).emit('assinatura.criada', empresaID, assinaturaID );
    }

    function assinaturaStatusAlterado( empresaID, assinaturaID, status ) {
        io.of(constant.WS_NSP_ADMIN).emit('assinatura.statusAlterado', empresaID, assinaturaID, status );
    }

    function assinaturaDadosAlterado( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_ADMIN).emit('assinatura.dadosAlterado', empresaID, assinaturaID );
    }

    function assinaturaEnderecoAlterado( empresaID, assinaturaID, endereco ) {
        io.of(constant.WS_NSP_ADMIN).emit('assinatura.enderecoAlterado', empresaID, assinaturaID, endereco );
    }

    function assinaturaProfissionaisAlterados( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_ADMIN).emit('assinatura.profissionaisAlterados', empresaID, assinaturaID );
    }
    
    // ------------- FATURAS ----------------
    
    function faturaCriada( empresaID, assinaturaID, faturaID ) {
        io.of(constant.WS_NSP_ADMIN).emit('fatura.criada', empresaID, assinaturaID, faturaID );
    }
    
    function faturaStatusAlterado( empresaID, assinaturaID, faturaID, novoStatus ) {
        io.of(constant.WS_NSP_ADMIN).emit('fatura.statusAlterado', empresaID, assinaturaID, faturaID, novoStatus );
    }

}());