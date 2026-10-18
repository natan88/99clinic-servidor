/*
 * Versão web, webApp
 */

/* global process, cfg, __dirname, path, global, __base, require */
;(function () {
    "use strict";
    const express = require('express'),
            // bodyParser = require('body-parser'),// desde a versão 4.16.0 não é mais necessário, já está incluso no express
            cfg = require('src/util/config.js'),
            constant = require('src/util/constant.js'),
            rota_main = require('./routes/main.js'),
            rota_exportar = require('./routes/exportar.js'),
            rota_empresa = require('./routes/empresa.js'),
            rota_arquivo = require('./routes/arquivo.js');

    // express configure
    const web = express();

    /**
     * [DEPLOY] Ao enviar para produtção, comentar o header Access-Control-Allow-Origin
     * 
     * Substitui bodyParser.json() e bodyParser.urlencoded() por express.json() e express.urlencoded() respectivamente
     */
    web.use(express.json());
    web.use(express.urlencoded({ extended: true }));
    web.disable('x-powered-by');// desabilita a informação de que o servidor web é o EXPRESS
    web.use(function (req, res, next) { // altera a informação do servidor web
      res.header("X-powered-by", "PHP 5.3");
    //   res.header('Access-Control-Allow-Origin', "*");// quando publicar, deve deixar comentado para impedir duplicidade com o nginx;
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,accept,x-requested-with'); 
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // ROTAS
    web.use('/', rota_main);
    web.use('/exportar', rota_exportar);
    web.use('/arquivo', rota_arquivo);
    web.use( constant.WS_NSP_ADMIN, rota_empresa);


    // tratamento de erros
    web.use(function(req, res, next) {
        let err = new Error('Página não encontrada');
        err.status = 404;
        next(err);
    });

    if (web.get('env') === 'development') {
        web.use(function(err, req, res, next) {
            res.json((err.status || 500), 'error', {
                message: err.message,
                error: err
            });
        });
    }

    web.use(function(err, req, res, next) {
        res.json((err.status || 500), 'error', {
            message: err.message,
            error: {}
        });
    });

    web.listen(cfg.porta_web, () => {
        console.log('Servidor web ouvindo na porta: ', cfg.porta_web);
    });
}());