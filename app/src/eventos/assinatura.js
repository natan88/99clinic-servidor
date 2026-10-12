;(function () {
    "use strict";

    /**
     * Eventos sobre assinatura e faturas, apenas para os administradores da empresa
     * 
     * Não emite eventos para a ADMINISTRAÇÃO INTERNA da 99Cliic
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

    // para todos
    function assinaturaCriada( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('assinatura.criada', assinaturaID );
    }

    // para todos
    function assinaturaStatusAlterado( empresaID, assinaturaID, status ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('assinatura.statusAlterado', assinaturaID, status );
    }

    // só para ADMINISTRADORES
    function assinaturaDadosAlterado( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa-admin.'+empresaID).emit('fatura.dadosAlterado', assinaturaID );
    }

    // só para ADMINISTRADORES
    function assinaturaEnderecoAlterado( empresaID, assinaturaID, endereco ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa-admin.'+empresaID).emit('fatura.enderecoAlterado', assinaturaID, endereco );
    }
    
    // só para todos
    function assinaturaProfissionaisAlterados( empresaID, assinaturaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('fatura.profissionaisAlterados', assinaturaID );
    }

    // ------------- FATURAS ----------------
    // tudo sobre faturas é apenas para ADMINISTRADORES

    function faturaCriada( empresaID, assinaturaID, faturaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa-admin.'+empresaID).emit('fatura.criada', assinaturaID, faturaID );
    }

    function faturaStatusAlterado( empresaID, assinaturaID, faturaID, novoStatus ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa-admin.'+empresaID).emit('fatura.statusAlterado', assinaturaID, faturaID, novoStatus );
    }

}());