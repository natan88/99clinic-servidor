;(function () {
    "use strict";

    /**
     * Os eventos aqui são emitidos apenas para o usuário, pois somente o usuário
     * pode visualizar seus prontuários
     */

    const prefixo = 'prontuario.',
    ouvinte = require('src/eventos/eventosInternos'),
    prontuario = require('src/controller/prontuario/prontuario'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on(prefixo + 'add', addProntuario)
    .on(prefixo + 'edit', editProntuario)
    .on(prefixo + 'del', delProntuario)
    .on(prefixo + 'ativaInativa', ativaInativaProntuario)
    .on(prefixo + 'ordenaProntuarios', ordenaProntuarios)
    .on(prefixo + 'modeloDeCampoAtualizado', modeloDeCampoAtualizado)
    ;


    function addProntuario(empresaID, usuario, prontuarioID) {
        const Prontuario = new prontuario( empresaID, usuario );

        Prontuario.getProntuario(prontuarioID).then( prontuario => {
            io.of(constant.WS_NSP_CLIENTE).to('user.'+usuario.id).emit( prefixo + 'add', prontuario );
        }).catch( err => {});

    }

    function editProntuario(empresaID, usuarioID, prontuarioID, prontuarioNome) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'edit', prontuarioID, prontuarioNome );
    }

    function delProntuario(empresaID, usuarioID, prontuarioID) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'del', prontuarioID );
    }

    function ativaInativaProntuario(empresaID, usuarioID, prontuarioID, status) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'ativaInativa', prontuarioID, status );
    }

    function ordenaProntuarios(empresaID, usuarioID, prontuariosID) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'ordenaProntuarios', prontuariosID );
    }

    function modeloDeCampoAtualizado(empresaID, usuarioID, prontuarioID, campoID, modelos ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'modeloDeCampoAtualizado', prontuarioID, campoID, modelos );
    }
}());