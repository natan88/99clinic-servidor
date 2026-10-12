;(function () {
    "use strict";

    /**
     * Os eventos aqui são emitidos apenas para o usuário, pois somente o usuário
     * pode visualizar seus prontuários
     */

    const prefixo = 'atendimento.',
    ouvinte = require('src/eventos/eventosInternos'),
    //prontuario = require('src/controller/prontuario'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on(prefixo + 'prontuarioAtualizado', prontuarioAtualizado)
    .on(prefixo + 'anexoEnviado', anexoEnviado)
    .on(prefixo + 'anexoAtualizado', anexoAtualizado)
    .on(prefixo + 'anexoExcluido', anexoExcluido)
    ;

    function prontuarioAtualizado( empresaID, usuarioID, atendimentoID, prontuarioID ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'prontuarioAtualizado', atendimentoID, prontuarioID );
    }

    function anexoEnviado( empresaID, usuarioID, atendimentoID, anexoID ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'anexoEnviado', atendimentoID, anexoID );
    }

    // atualizou nome e descrição
    function anexoAtualizado( empresaID, usuarioID, atendimentoID, anexoID, anexoNome, anexoDescricao ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'anexoAtualizado', atendimentoID, anexoID, anexoNome, anexoDescricao );
    }

    function anexoExcluido( empresaID, usuarioID, atendimentoID, anexoID ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'anexoExcluido', atendimentoID, anexoID );
    }
}());