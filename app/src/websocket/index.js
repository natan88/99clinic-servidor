/*
 * Instancia o webcoket e chama os demais namespaces
 * Cada área funciona em um namespace diferente
 */

;(function () {
    "use strict";
    
    const express = require('express')(),
        http = require('http').Server(express),
        io = require('socket.io')(http),
        cfg = require('src/util/config.js'),
        eventosInternos = require("src/eventos/eventosInternos");

        
    /*
     * Importante manter o eventosInternos instanciado aqui, pois caso ele não seja
     * instanciado, não será possível ouvir os eventos e então encaminhá-los ao
     * websocket
     */
    eventosInternos.setSocket(io);
    
    //// permite que seja chamado de outro servidor CORS
    express.use( (req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        next();
    });

    // Instancia os NAMESPACES
    require('./admin')(io);
    require('./cliente')(io);

    http.listen(cfg.porta_ws, () => {
        console.log('Servidor websocket ouvindo na porta *:' + cfg.porta_ws);
    });
}());