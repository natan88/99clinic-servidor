
/*
 *  Para a administração interna (área dos geresteores do 99Clinic)

 */

;(function () {
    "use strict";

    let express = require('express'),
        router = express.Router(),
        Login = require('src/admin/autenticacao');

    //----------------------------- Basico ---------------------------   

    /**
     * Faz o login de um operador da 99Clinic na área de administração interna
     */
    router.post('/login', (req, res) => {
        let dados = req.body;
        if( !dados ) return res.json({status: false, reason: 'Dados obrigatórios faltando' });

        Login.logar( dados.login || null, dados.password || null )
        .then( token => res.json({status: true, token: token }) )
        .catch( erro => res.json({status: false, reason: erro }) );
    });

    router.post('/logout', (req, res) => {
        Autenticacao.logout(req.body.token || null );
        res.send("ok");
    });

    module.exports = router;
}());