;(function () {
    "use strict";
    
    const Joi = require("joi"),
        //Promise = require("promise"), // tem nativamente
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;
    

    // verifica se e-mail está em uso por outra pessoa no nomento do cadastro
    function dadosEmUso(empresaID, nome, email, cpf, id) {
        return new Promise( function (resolve, reject) {
            let where = 'empresa_id = ?';
            let col = [empresaID];
            if(id) {
                where += ' AND id != ?';
                col.push(id);
            }
  
            const Nome = function(callback) {
                if(!nome) return callback();
                let colN = _.clone(col);
                colN.push(nome);
                mysql.query('SELECT count(*) AS total FROM profissional WHERE '+where+' AND nome = ?', colN, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0) return callback();
                    if (res[0].total > 0) return callback(null, 'nome em uso por outro profissional');
                    callback();
                });
            };
            
            const Email = function(callback) {
                if(!email) return callback();
                let colE = _.clone(col);
                colE.push(email);
                mysql.query('SELECT count(*) AS total FROM profissional WHERE '+where+' AND email = ?', colE, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0) return callback();
                    if (res[0].total > 0) return callback(null, 'e-mail em uso por outro profissional');
                    callback();
                });
            };
            
            const Cpf = function(callback) {
                if(!cpf) return callback();
                let colC = _.clone(col);
                colC.push(cpf);
                mysql.query('SELECT count(*) AS total FROM profissional WHERE '+where+' AND cpf = ?', colC, function(err, res){
                    if(err || !res) return callback("erro interno");
                    if (res.length === 0) return callback();
                    if (res[0].total > 0) return callback(null, 'cpf em uso por outro profissional');
                    callback();
                });
            };
            
            //parallel series
            async.parallel({nome:Nome, email:Email, cpf:Cpf
            }, function (err, res) {
                if(err) return reject(err);
                let retorno = {};
                if(res.nome) retorno.nome = res.nome;
                if(res.email) retorno.email = res.email;
                if(res.cpf) retorno.cpf = res.cpf;

                if(!_.isEmpty(retorno)) return reject(retorno);
                return resolve();
            });

        });
    }

    /**
     * Checa se um e-mail esta em uso por outro usuário, necessário pois ao registrar
     * ou atualizar um profissional, esse e-mail sera registrado na tabela 'usuario'
     * 
     * Considerar apenas usuários do perfil profissional (p)
     * 
     * @param {int} empresaID PK empresa
     * @param {string} email email que será checado
     * @param {int} usuarioID PK do usuário
     */
    function emailUsuarioEmUso(empresaID, email, usuarioID){
        return new Promise( (resolve, reject)=> {
            let where = 'email = ? AND empresa_id = ? AND perfil = ?';
            let colunas = [email, empresaID, 'p'];
            if(usuarioID) {
                where += ' AND id != ?';
                colunas.push(usuarioID);
            }
            
            mysql.query(`SELECT COUNT(*) AS count FROM usuario WHERE ${where}`, colunas, (err, res)=> {
                if(err) return reject("erro interno");
                if(res[0].count > 0 ) return reject({email: 'Pertence a outro usuário'});
                return resolve();
            });
        });
    }
    
    // verifica se o MEDICO pertence a empresa
    /**
     * Verifica se o médico pertence a empresa
     * Quando esta adicionando, não há o que verificar
     * Retorna também o nome da empresa e outros dados do profissional
     * 
     * ATENÇÃO: não confiar nos dados de retorno, pois só irá retornar se já houver
     * profissionais cadastrados
     */
    function daEmpresa(empresaID, medicoID){
        return new Promise( (resolve, reject) => { 
            //if(!medicoID) return resolve();// se não estiver atualizando

            let where = 'p.empresa_id = ?';
            let colunas = [empresaID];

            if( medicoID ) {
                where +=' AND p.id = ?';
                colunas.push( medicoID );
            }

            mysql.query(`SELECT p.*, e.nome AS empresaNome 
            FROM profissional p
            LEFT JOIN empresa e ON (e.id = p.empresa_id)
            WHERE ${where} LIMIT 1`, colunas, (err, res) => {
                if ( err || !res ) return reject("erro interno");
                if ( medicoID && res.length === 0 ) return reject({nome: 'Este profissional não existe'});
                if ( !medicoID && res.length === 0 ) return reject('A empresa parece não existir');
                
                return resolve( res[0] );
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

    /**
     * Retorna TRUE se a empresa pode adicionar novo profissional e FALSE se não pode
     * REGRA
     * O plano grátis permite apenas 1 profissional (não considerar profissionais de demonstração)
     * @param {Integer} empresaID PK da empresa
     * @param {String} plano plano de assinatura da empresa (gratis ou pró)
     */
    function atingiuLimiteProfissionais ( empresaID, callback ) {
        assinaturaUtil.getCacheAssinatura( empresaID ).then( assinatura => {
            if( assinatura.plano == 'pró') return callback();

            mysql.query(`SELECT count(*) AS total FROM profissional WHERE empresa_id = ? AND demo !='s'`, [empresaID], (err, result) => {
                if( err || !result ) return callback('erro interno A');
                if( !result.length ) return callback('erro interno B');
                if( result[0].total >= 1 ) return callback({limiteGratis: true, limiteProfissionais: result[0].total});
                callback();
            });
        }).catch( erro => callback( erro ));
    }

    /*
     * Valida os dados do médico, ao cadastrar.
     * Somente para administrador
     */
    function valida(empresaID, userPerfil, dados) {
        return new Promise( function (resolve, reject) {
            if(userPerfil !== 'a') return reject('Você não tem permissão');
            
            let objDia = Joi.array().max(4).items(Joi.object().keys({
                de: Joi.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Não é uma hora válida').required(),
                a:  Joi.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Não é uma hora válida').required()
            }));

            
            let schema = Joi.object().options({ abortEarly: false }).keys({
                id: Joi.number().integer().positive().allow(''),
                usuario_id: Joi.number().integer().positive().allow('').strip(),// para evitar erros
                online:  Joi.boolean().allow([null, '']).strip(),// para evitar erros
                nome:   Joi.string().min(3).max(50).required(),
                sexo:  Joi.string().length(1).lowercase().regex(/^(f|m)$/).allow(['', null]),
                nascimento: Joi.date().raw().allow(['', null]),
                nota:  Joi.string().allow(['', null]),
                uf:  Joi.string().length(2).allow(['', null]),
                cidade:  Joi.string().min(3).max(100).allow(['', null]),
                bairro:  Joi.string().min(3).max(100).allow(['', null]),
                endereco:  Joi.string().min(3).max(250).allow(['', null]),
                cep:  Joi.number().positive().allow(['', null]),
                email:  Joi.string().email().required(),
                celular:  Joi.number().positive().allow(['', null]),
                telefone:  Joi.number().positive().allow(['', null]),
                cpf:  Joi.string().regex(/[0-9]{11}$/).allow(['', null]),
                servico:  Joi.array().items({
                    id: Joi.number().positive().required(),
                    valor: Joi.number().positive().precision(2).required().allow(0)
                }).allow([null]),
                convenio:  Joi.array().items(Joi.number().positive().allow(['', null])).single().unique().allow(['', null]),
                horario:  Joi.object().length(7).keys({
                    mon: objDia,
                    tue: objDia,
                    wed: objDia,
                    thu: objDia,
                    fri: objDia,
                    sat: objDia,
                    sun: objDia
                }).allow(['', null]),
                ativo:  Joi.string().length(1).lowercase().regex(/^(s|n)$/).required(),
                conselho:  Joi.string().max(15).allow(['', null]).default(null),
                conselho_uf:  Joi.string().length(2).allow(['', null]),
                conselho_nr:  Joi.string().max(15).allow(['', null]),
                tratamento:  Joi.string().regex(/^(Dr\.|Dra\.|Sr\.|Sra\.)$/).allow(['', null]),
                especialidade:  Joi.string().max(60).allow(['', null]),
                senha: Joi.any().when('id', { 
                    is: Joi.exist(), 
                    then: Joi.any().strip(), 
                    otherwise: Joi.string().regex(/^(gerar|link)$/).required()
                })
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);

                if(_.isEmpty(erros)) {
                    erros = {};
                    async.parallel({
                        emUso: function(callback) {
                            dadosEmUso(empresaID, dados.nome || null, dados.email || null, dados.cpf || null, dados.id || null).then(function(){
                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        userDaEmpresa: function(callback) {
                            daEmpresa(empresaID, dados.id || null).then(function(_dados){
                                value.empresaNome = _dados.empresaNome;

                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        usuario: (callback) => {
                            emailUsuarioEmUso(empresaID, dados.email || null, undefined)
                            .then( () => callback() )
                            .catch( erro => {
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        conta: ( callback ) => {
                            contaBloqueada( empresaID, callback );
                        },
                        limiteProfissionais: ( callback ) => {
                            atingiuLimiteProfissionais( empresaID, callback );
                        }
                    },
                    function(err){
                        if( err ) return reject( err );// erro retornado pelas funções (conta apenas por enquanto)
                        if(!_.isEmpty(erros)) return reject(erros);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }// valida
    
    /*
     * Valida os dados do médico, ao atualizar.
     * Somente para administrador
     */
    function validaEdit(empresaID, user, dados) {
        return new Promise( function (resolve, reject) {

            if( user.perfil == 'p') {
                if( user.profissional_id !== dados.id) {
                    return reject('Você só pode altera seus próprios dados');
                }
            }
            else if(user.perfil != 'a') return reject('Você não tem permissão');

            const schema = Joi.object().options({ abortEarly: false }).keys({
                id: Joi.number().integer().positive().required(),
                usuario_id: Joi.number().integer().positive(),
                online:  Joi.boolean().allow([null, '']).strip(),// para evitar erros
                nome:   Joi.string().min(3).max(50).required(),
                sexo:  Joi.string().length(1).lowercase().regex(/^(f|m)$/).allow(['', null]),
                nascimento: Joi.date().raw().allow(['', null]),
                nota:  Joi.string().allow(['', null]),
                uf:  Joi.string().length(2).allow(['', null]),
                cidade:  Joi.string().min(3).max(100).allow(['', null]),
                bairro:  Joi.string().min(3).max(100).allow(['', null]),
                endereco:  Joi.string().min(3).max(250).allow(['', null]),
                cep:  Joi.number().positive().allow(['', null]),
                email:  Joi.string().email().required(),
                celular:  Joi.number().positive().allow(['', null]),
                telefone:  Joi.number().positive().allow(['', null]),
                cpf:  Joi.string().regex(/[0-9]{11}$/).allow(['', null]),
                ativo:  Joi.string().length(1).lowercase().regex(/^(s|n)$/).required(),
                conselho:  Joi.string().max(15).allow(['', null]).default(null),
                conselho_uf:  Joi.string().length(2).allow(['', null]),
                conselho_nr:  Joi.string().max(15).allow(['', null]),
                tratamento:  Joi.string().regex(/^(Dr\.|Dra\.|Sr\.|Sra\.)$/).allow(['', null]),
                especialidade:  Joi.string().max(60).allow(['', null]),
                demo: Joi.string().length(1).lowercase().regex(/^(s|n)$/).allow(['', null]).strip()
            });
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(_.isEmpty(erros)) {
                    erros = {};
                    async.parallel({
                        emUso: function(callback) {
                            dadosEmUso(empresaID, dados.nome || null, dados.email || null, dados.cpf || null, dados.id || null ).then(function(){
                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        daEmpresa: function(callback) {
                            daEmpresa(empresaID, dados.id || null).then(function( _dados ){
                                value.empresaNome = _dados.empresaNome;
                                value.emailAntigo = _dados.email;

                                callback();
                            }).catch(function(erro){
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        usuario: (callback) => {
                            emailUsuarioEmUso(empresaID, dados.email || null, dados.usuario_id)
                            .then( ( ) => callback() )
                            .catch( erro => {
                                _.extend(erros, erro);
                                callback();
                            });
                        },
                        conta: ( callback ) => {
                            contaBloqueada( empresaID, callback );
                        }
                    },
                    function(err){
                        if( err ) return reject( err );// erro retornado pelas funções (conta apenas por enquanto)
                        if(!_.isEmpty(erros)) return reject(erros);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }
    
    function validaHorario(user, medicoID, horarios) {
        return new Promise( function (resolve, reject) {
            if( user.perfil == 'p') {
                if( user.profissional_id !== medicoID) {
                    return reject('Você só pode altera seus próprios dados');
                }
            }
            else if(user.perfil != 'a') return reject('Você não tem permissão');
            
            const objDia = Joi.array().max(4).items(Joi.object().keys({
                de: Joi.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Não é uma hora válida').required(),
                a:  Joi.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Não é uma hora válida').required(),
                $$hashKey: Joi.string().strip()
            }));
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                mon: objDia,
                tue: objDia,
                wed: objDia,
                thu: objDia,
                fri: objDia,
                sat: objDia,
                sun: objDia
            });
            
            Joi.validate(horarios, schema, function (err, value) {
                const erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(_.isEmpty(erros)) {
                    resolve(value);
                }else return reject(erros);
            });
        });
    }
    
    function validaConvenio(user, medicoID, dados) {
        return new Promise( function (resolve, reject) {
            if( user.perfil == 'p') {
                if( user.profissional_id !== medicoID) {
                    return reject('Você só pode altera seus próprios dados');
                }
            }
            else if(user.perfil != 'a') return reject('Você não tem permissão');

            const schema = Joi.array().options({ abortEarly: false }).items(
                Joi.number().positive().allow(['', null])).single().unique().allow(['', null]
            );
            
            Joi.validate(dados, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err,true);
                if(_.isEmpty(erros)) {
                    resolve(value);
                }else return reject(erros);
            });
        });
    }
    
    function validaServico(user, medicoID, servicos) {
        return new Promise( function (resolve, reject) {
            if( user.perfil == 'p') {
                if( user.profissional_id !== medicoID) {
                    return reject('Você só pode altera seus próprios dados');
                }
            }
            else if(user.perfil != 'a') return reject('Você não tem permissão');
            
            const schema = Joi.array().options({ abortEarly: false }).items({
                id: Joi.number().positive().required(),
                valor: Joi.number().positive().precision(2).required().allow(0)
            });
            
            Joi.validate(servicos, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(_.isEmpty(erros)) resolve(value);
                else return reject(erros);
            });
        });
    }

    /**
     * Valida a solicitação da URL para autorização de acesso a agenda do google
     * 
     * REGRAS
     * As mesmas de 'validaGoogleAgenda' +
     * - Não pode haver outra autorização ativa
     */
    function validaGoogleAgendaGetUrl( user ) {
        return new Promise( (resolve, reject) => {
            // if( user.perfil != 'p' ) return reject('Você não tem permissão');
            // if( !user.profissional_id ) return reject('Inconsistência na requisição');
            
            async.parallel({
                basico: (callback) => {
                    validaGoogleAgenda( user ).then( dados => {
                        callback( null, dados );
                    }).catch( erros => {
                        callback( erros );
                    });
                },
                autorizacaoAnterior: ( callback ) => {
                    mysql.query(`SELECT count(*) AS total FROM google_agenda WHERE empresa_id = ? AND profissional_id = ? AND ativo = 's'`, [ user.empresa_id, user.profissional_id ], (err, result) => {
                        if(err || !result) return callback("erro interno");
                        if(result.length > 0 ) {
                            if( result[0].total > 0 ) callback(' Essa conta está autorizada');
                        }
                        callback();
                    });
                }
            },
            (err) => {
                if( err ) return reject( err );
                resolve();
            });
        });
    }

    /**
     * Verifica se um profissional pode sincronizar sua agenda do 99Clinic com a agenda do google
     * REGRAS
     * - o usuário deve ser um profissional
     * - a empresa deve ser assinante do plano pró (plano ativo)
     * - o profissional deve ter os recursos pró liberados
     */
    function validaGoogleAgenda( user ) {
        return new Promise( (resolve, reject) => {
            if( user.perfil != 'p' ) return reject('Você não tem permissão');
            if( !user.profissional_id ) return reject('Inconsistência na requisição');
            
            let dados;
            async.parallel({
                daEmpresa: (callback) => {
                    daEmpresa( user.empresa_id, user.profissional_id)
                    .then(  _dados => {
                        dados = _dados;
                        callback();
                    }).catch( (erro) => {
                        callback( erro );
                    });
                },
                conta: ( callback ) => {
                    assinaturaUtil.profissionalEAssinante( user.empresa_id, user.profissional_id )
                    .then( () => {
                        callback();
                    }).catch( erro => {
                        callback( erro === 1 ? 'Conta bloqueada' : 'Recurso disponível apenas para assinantes')
                    });
                }
            },
            (err) => {
                if( err ) return reject( err );
                resolve(dados);
            });
        });
    }

    exports.valida = valida;
    exports.validaEdit = validaEdit;
    exports.validaHorario = validaHorario;
    exports.validaConvenio = validaConvenio;
    exports.validaServico = validaServico;
    exports.validaGoogleAgendaGetUrl = validaGoogleAgendaGetUrl;
    exports.validaGoogleAgenda = validaGoogleAgenda;
}());