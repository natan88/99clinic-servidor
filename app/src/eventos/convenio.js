;(function () {
    "use strict";

    /**
     * Eventos relacionados aos convênios
     */

    const 
    prefixo = 'convenio.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( prefixo + 'add', add )
    .on( prefixo + 'edit', edit )
    ;

    function add( empresaID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}add`, dados);
    }

    function edit( empresaID, convenioID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}edit`, convenioID, dados);
    }
}());