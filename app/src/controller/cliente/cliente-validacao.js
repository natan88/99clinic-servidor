;(function () {
    "use strict";
    
    const Joi = require("joi"),
        // Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;

    // verifica se e-mail está em uso por outra pessoa no nomento do cadastro
    function dadosEmUso(empresaID, email, cpf, nome, permiteNomesDuplicados, id){
        return new Promise( function (resolve, reject) {
            let where = 'empresa_id = ?';
            let col = [empresaID];
            if(id) {
                where += ' AND id != ?';
                col.push(id);
            }

            let Email = function(callback) {
                if(!email || _.isEmpty(email)) return callback();
                let whereE = 'empresa_id = ? AND email IN ?';
                let colE = [empresaID, [email]];
                if(id) {
                    whereE += ' AND cliente_id != ?';
                    colE.push(id);
                }
                
                mysql.query('SELECT email FROM cliente_email WHERE '+whereE, colE, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0 ) return callback();
   
                    let i;
                    let retorno = {};
                    async.each(res, function(m, cbk){
                        i = _.indexOf(email, m.email);
                        if( !retorno.email ) retorno.email = {};
                        retorno.email[i] = 'E-mail "'+m.email+'" em uso por outro cliente';
                        cbk();
                    }, function(){
                        callback(null, retorno);
                    });
                    
                });
            };
            
            let Cpf = function(callback) {
                if(!cpf) return callback();
                let colC = _.clone(col);
                colC.push(cpf);
                mysql.query('SELECT count(*) AS total FROM cliente WHERE '+where+' AND cpf = ?', colC, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0) return callback();
                    if (res[0].total > 0) return callback(null, 'cpf em uso por outro cliente');
                    callback();
                });
            };
            
            // em algumas situações, como importar em massa, pode ser necessário
            // restringir nomes duplicados
            let Nome = function(callback) {
                if(!nome || permiteNomesDuplicados === true) return callback();
                let colN = _.clone(col);
                colN.push(nome);
                mysql.query('SELECT id FROM cliente WHERE '+where+' AND nome = ? LIMIT 1', colN, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0) return callback();
                    if (res[0].id) return callback(null, {duplicado: true, user: res[0].id });
                    callback();
                });
            };
            
            //parallel series
            async.parallel({email:Email, cpf:Cpf, nome: Nome
            }, function (err, res) {
                if(err) return reject(err);
                let retorno = {};
                if(res.email) _.extend(retorno, res.email);
                if(res.cpf) retorno.cpf = res.cpf;
                if(res.nome) retorno.nome = res.nome;
                
                if(!_.isEmpty(retorno)) return reject(retorno);
                return resolve();
            });
        });
    }
    
    // verifica se o CLIENTE pertence a empresa
    function daEmpresa(empresaID, clienteID){
        return new Promise( function (resolve, reject) { 
            if(!clienteID) return resolve();// se não estiver atualizando
            mysql.query('SELECT COUNT(*) AS count FROM cliente WHERE id = ? AND empresa_id = ?', [clienteID, empresaID], function(err, res){
                if(err || !res) return reject("erro interno");
                if(res[0].count === 0 ) return reject({nome: 'Este paciente não existe'});
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
     * Valida os dados do paciente/cliente.
     */
    function valida(empresaID, userPerfil, dados, permiteNomesDuplicados) {
        return new Promise( function (resolve, reject) {
            //if(userPerfil != 'a') return reject('Você não tem permissão');
            let schema = Joi.object().options({ abortEarly: false }).keys({
                id:     Joi.number().integer().positive().allow(''),
                nome:   Joi.string().min(3).max(100).required(),
                sexo:  Joi.string().length(1).lowercase().regex(/^(f|m)$/, 'Permitido Masculino(m) ou Feminino(f)').allow(['', null]),
                ec:  Joi.string().length(2).lowercase().regex(/^(so|ca|vv|se|ue|dv)$/, 'Inválido').allow(['', null]),
                nascimento: Joi.date().raw().allow(['', null]),
                nota:  Joi.string().allow(['', null]),
                nota_contato:  Joi.string().allow(['', null]),
                uf:  Joi.string().min(2).max(2).allow(['', null]),
                cidade:  Joi.string().min(3).max(100).allow(['', null]),
                bairro:  Joi.string().min(3).max(100).allow(['', null]),
                endereco:  Joi.string().min(3).max(150).allow(['', null]),
                complemento:  Joi.string().min(3).max(250).allow(['', null]),
                cep:  Joi.number().positive().allow(['', null]),
                email:  Joi.array().items(Joi.string().email().allow('')).single().unique().allow(['', null]),
                telefone:  Joi.array().items(Joi.number().positive().allow(['', null])).single().unique().allow(['', null]),
                celular:  Joi.array().items(Joi.number().positive().allow(['', null])).single().unique().allow(['', null]),
                cpf:  Joi.string().regex(/[0-9]{11}$/).allow(['', null]),
                rg:  Joi.string().regex(/[0-9]$/).allow(['', null]), // 9223372036854775807 é o máximo aceito pelo MySQL para BIGINT
                rg_orgao:  Joi.string().max(15).allow(['', null]),
                demo: Joi.string().length(1).lowercase().regex(/^(s|n)$/).allow(['', null]).strip()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(_.isEmpty(erros)) {
                    erros = {};
                    async.parallel({
                        emUso: function(callback) {
                            dadosEmUso(empresaID, dados.email || null, dados.cpf || null, dados.nome || null, permiteNomesDuplicados, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        userDaEmpresa: function(callback) {
                            daEmpresa(empresaID, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        conta: ( callback ) => {
                            contaBloqueada( empresaID, callback );
                        }
                    },
                    function( err ){
                        if( err ) return reject( err ); // erro emitido pelas funções (por enquanto apenas de conta)
                        if(!_.isEmpty(erros)) return reject(erros);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }
 

    exports.valida = valida;
}());