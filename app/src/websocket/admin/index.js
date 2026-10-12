/*
 * Administração interna. Para administrar os clientes do 99Clinic
 */

; (function () {
    "use strict";

    const login = require("./apertoDeMao.js"),
        controleEmpresa = require('./empresa.js'),
        controleAssinatura = require('./assinatura'),
        constant = require('src/util/constant.js');

    function Admin(sio) {
        if (!sio) return;

        let app = sio.of(constant.WS_NSP_ADMIN);
        app.use(login.apertoDeMao);

        app.on('connection', (socket) => {
            controleEmpresa.controller(socket);
            controleAssinatura.controller(socket);

            // socket.on('disconnect', function () {
            // });
        });

        app.on('error', (s) => { });
    }

    module.exports = Admin;
}());