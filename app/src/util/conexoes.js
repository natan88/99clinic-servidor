
;(function () {
    "use strict";
    const mysql = require('mysql'),
        redis = require('redis'),
        config = require('src/util/config.js'),
         _ = require('underscore'),
         log = require('src/util/logInterno');
    

    /*------------ POOL DE CONEXÃO -------------*/
    // retirado de http://stackoverflow.com/questions/17015590/node-js-mysql-needing-persistent-connection
    // resposta de: Adam Yost
    const pool = mysql.createPool({
        connectionLimit: 10,
        host: config.mysql.host,
        port: config.mysql.port,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        debug: false
    });

    function query() {
        let sql_args = [];
        let args = [];
        for (let i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        
        let callback = args[args.length - 1]; //last arg is callback
        pool.getConnection(function (err, connection) {
            if (err) {
                if (callback && _.isFunction(callback)) {
                    callback(err);
                }
                return;
            }
            if (args.length >= 1) {
                sql_args = args[1];
            }
            connection.query(args[0], sql_args, function (err, results) {
                connection.release(); // Libera a conexão
                if (err) {
                    // Registra o erro no log interno
                    let erroLog =  `CODE: ${err.code || ''} \n\nsqlMessage: ${err.sqlMessage || ''} \n\nQuery: ${err.sql || ''}`;
                    log.registraErro( erroLog, 'mysql', 'indefinido');

                    if (callback && _.isFunction(callback)) {
                        callback(err);
                    }
                    return;
                } else 
                if (callback && _.isFunction(callback)) {
                    callback(null, results);
                }
            });
        });
    }

    let clienteRedis;
    function conectaRedis() {
        if (!clienteRedis) {
            clienteRedis = redis.createClient(config.redis.port, config.redis.host);
            
            if(config.redis.password !== null) {
                clienteRedis.auth(config.redis.password);
            }
            
            clienteRedis.on('error', function(err){
                let erroLog =  `CODE: ${err.code || ''} \n\nEndereço: ${err.address || ''} \n\nPorta: ${err.port || ''}`;
                log.registraErro( erroLog, 'redis', 'src/util/conexoes.js');
            });

            // clienteRedis.on("ready", function(){ // redis pronto
            // });

            clienteRedis.on("connect", function(){
                console.log('redis conectado');
            });

            clienteRedis.on("end", function(){
                clienteRedis = null;
            });
        }
        return clienteRedis;
    }
    
    exports.query = query;
    exports.pool = pool;
    exports.redis = conectaRedis;
}());