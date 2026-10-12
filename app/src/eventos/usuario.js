;(function () {
    "use strict";

    /**
     * Eventos relacionados aos usuários das empresas
     */

    const 
    prefixo = 'usuario.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( prefixo + 'add', usuarioAdd)
    .on( prefixo + 'edit', usuarioEdit)
    .on( prefixo + 'del', usuarioDel)
    .on( prefixo + 'entrou', usuarioEntrou)
    .on( prefixo + 'saiu', usuarioSaiu)
    .on( prefixo + 'emailAtualizado', emailAtualizado)
    .on( prefixo + 'imagemAlterada', imagemAlterada)
    .on( prefixo + 'imagemRemovida', imagemRemovida)
    .on( prefixo + 'googleCalenarAutorizacao', googleCalenarAutorizacao)
    ;


    function usuarioAdd( empresaID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.add', dados);
    }

    function usuarioEdit( empresaID, usuarioID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.edit', usuarioID, dados);
    }

    function usuarioDel( empresaID, usuarioID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.del', usuarioID);
    }

    function usuarioEntrou( empresaID, usuarioID, perfil ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.entrou', usuarioID, perfil );
    }

    function usuarioSaiu( empresaID, usuarioID, perfil ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.saiu', usuarioID, perfil );
    }

    function emailAtualizado( empresaID, usuarioID, novoEmail ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.emailAtualizado', usuarioID, novoEmail );
    }

    function imagemAlterada( empresaID, usuarioID, imagem ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.imagemAlterada', usuarioID, imagem );
    }

    function imagemRemovida( empresaID, usuarioID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('usuario.imagemRemovida', usuarioID );
    }

    function googleCalenarAutorizacao( empresaID, usuarioID, statusAutorizacao ) {
        io.of(constant.WS_NSP_CLIENTE).to('user.'+usuarioID).emit( prefixo + 'googleCalenarAutorizacao', statusAutorizacao );
    }
}());