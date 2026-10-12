;(function () {
    "use strict";

    /**
     * Eventos relacionados a empresa, como alteração dos dados e altração da logo
     */

    const 
    prefixo = 'empresa.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( `${prefixo}edit`, empresaEdit )
    .on( `${prefixo}logoAlterada`, logoAlterada )
    .on( `${prefixo}logoRemovida`, logoRemovida )
    ;

     /*---------------------- EMPRESA ---------------------*/
    function empresaEdit( empresaID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit( `${prefixo}edit`, dados );
    }

    function logoAlterada( empresaID, imagem ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit( `${prefixo}logoAlterada`, imagem );
    }

    function logoRemovida( empresaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit( `${prefixo}logoRemovida` );
    }

}());