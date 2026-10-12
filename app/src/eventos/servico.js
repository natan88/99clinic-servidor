;(function () {
    "use strict";

    /**
     * Eventos relacionados aos serviços
     */

    const 
    prefixo = 'servico.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( prefixo + 'add', add )
    .on( prefixo + 'edit', edit )
    .on( prefixo + 'del', del )
    ;

    function add( empresaID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}add`, dados );
    }

    function edit( empresaID, servicoID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}edit`, servicoID, dados );
    }

    function del( empresaID, servicoID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}del`, servicoID );
    }
}());