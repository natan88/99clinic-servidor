;(function () {
    "use strict";

    /**
     * Eventos relacionados aos pacientes
     */

    const 
    prefixo = 'paciente.',
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( prefixo + 'edit', edit )
    .on( prefixo + 'del', del )
    ;

    function edit( empresaID, clienteID, dados ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}edit`, clienteID, dados);
    }

    function del( empresaID, clienteID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit(`${prefixo}del`, clienteID);
    }
}());