;(function () {
    "use strict";

    /**
     * Eventos relacionados a 
     */

    const 
    ouvinte = require('src/eventos/eventosInternos'),
    constant = require('src/util/constant.js'),
    io = ouvinte.getSocket();

    ouvinte
    .on( 'util.removeDadosDemonstracao', limpaDadosDemonstracao )
    ;

    /*---------------------- UTIL ---------------------*/
    function limpaDadosDemonstracao( empresaID ) {
        io.of(constant.WS_NSP_CLIENTE).to('empresa.'+empresaID).emit('util.delDemo');
    }
}());