;(function () {
    "use strict";
    
    const Joi = require("joi"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;
    


    // verifica se e-mail está em uso por outra empresa no nomento do cadastro
    function dadosEmUso(empresaID, email, id){
        return new Promise( function (resolve, reject) {
            let where = 'nome = ? AND empresa_id = ?';
            let col = [email, empresaID];
            if(id) {
                where += ' AND id != ?';
                col.push(id);
            }
            mysql.query('SELECT COUNT(*) AS count FROM servico WHERE '+where, col, function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count > 0 ) return reject({nome: 'Já existe um serviço com esse nome'});
                return resolve();
            });
        });
    }
    
    // verifica se o SERVIÇO pertence a empresa
    function daEmpresa(empresaID, servicoID){
        return new Promise( function (resolve, reject) { 
            if(!servicoID) return resolve();// se não estiver atualizando
            mysql.query('SELECT COUNT(*) AS count FROM servico WHERE id = ? AND empresa_id = ?', [servicoID, empresaID], function(err, res){
                if(err) return reject("erro interno");
                if(res[0].count == 0 ) return reject({nome: 'Este serviço não existe'});
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
     * Valida os dados do serviço.
     * Somente para
     */
    function valida(empresaID, userPerfil, dados) {
        return new Promise( function (resolve, reject) {
            if(userPerfil != 'a') return reject('Você não tem permissão');
            // if( dados && !dados.valor ) {
            //     dados.valor = 0;
            // }
            const schema = Joi.object().options({ abortEarly: false }).keys({
                id:     Joi.number().integer().positive().allow(''),
                nome:   Joi.string().min(3).max(50).required(),
                descricao:  Joi.string().allow(['', null]),
                valor:   Joi.number().positive().precision(2).required().allow([0]),
                tempo:  Joi.number().positive().multiple(5).required().allow([null]),
                prazo_retorno:  Joi.number().positive().required().allow(0),
                ativo:  Joi.string().length(1).lowercase().regex(/^(s|n)$/).required(),
                demo: Joi.string().length(1).lowercase().regex(/^(s|n)$/).allow(['', null]).strip()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    async.parallel({
                        emUso: function(callback) {
                            dadosEmUso(empresaID, dados.nome, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                callback(erro);
                            });
                        },
                        userDaEmpresa: function(callback) {
                            daEmpresa(empresaID, dados.id || null).then(function(){
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