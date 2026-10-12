;(function () {
    "use strict";
    
    const Joi = require("joi"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;
    


    // verifica se e-mail está em uso por outra empresa no nomento do cadastro
    function nomeEmUso(empresaID, nome, id){
        return new Promise( function (resolve, reject) {
            let where = 'nome = ? AND empresa_id = ?';
            let col = [nome, empresaID];
            if(id) {
                where += ' AND id != ?';
                col.push(id);
            }
            mysql.query('SELECT COUNT(*) AS count FROM convenio WHERE '+where, col, function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count > 0 ) return reject({nome: 'nome em uso'});
                return resolve();
            });
        });
    }
    
    // verifica se o convênio pertence a empresa
    function convenioDaEmpresa(empresaID, convenioID){
        return new Promise( function (resolve, reject) { 
            if(!convenioID) return resolve();
            mysql.query('SELECT COUNT(*) AS count FROM convenio WHERE id = ? AND empresa_id = ?', [convenioID, empresaID], function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count == 0 ) return reject({nome: 'Este convênio não existe'});
                return resolve();
            });
        });
    }

    /**
     * Verifica se a conta esta bloqueada por falta de pagamento do plano pró
     */
    function contaBloqueada ( empresaID, callback ) {
        assinaturaUtil.contaBloqueada( empresaID )
        .then( bloqueado => {
            if( bloqueado ) return callback('Conta bloqueada. Entre em contato com o suporte.');
            callback();
        })
        .catch( erro => callback ( erro ) );
    }
    
    /*
     * Validação do convênio
     */
    function valida(empresaID, userID, userPerfil, dados) {
        return new Promise( function (resolve, reject) {
            if(userPerfil != 'a') return reject('Você não tem permissão');
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                id:     Joi.number().integer().positive().allow(''),
                nome:   Joi.string().min(3).max(60).required(),
                ativo:  Joi.string().length(1).lowercase().regex(/^(s|n)$/).required()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    async.parallel({
                        nomeEmUso: function(callback) {
                            nomeEmUso(empresaID, dados.nome, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                callback(erro);
                            });
                        },
                        convenioDaEmpresa: function(callback) {
                            convenioDaEmpresa(empresaID, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                callback(erro);
                            });
                        },
                        contaAtiva: ( callback ) => {
                            contaBloqueada( empresaID, callback );
                        }
                    },
                    function(err, result){
                        if(err) return reject(err);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }
 

    exports.valida = valida;
}());