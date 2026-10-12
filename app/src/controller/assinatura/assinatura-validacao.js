(function () {
    "use strict";

    const
        mysql = require('src/util/conexoes.js'),
        async = require('async'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        Joi = require("joi");


    const schemaEndereco = Joi.object().keys({
        cep:          Joi.number().required(),
        uf:           Joi.string().regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/).required(),
        cidade:       Joi.string().max(100).required(),
        bairro:       Joi.string().max(100).required(),
        endereco:     Joi.string().max(150).required(),
        numero:       Joi.number().positive().allow(['', null]),
        complemento:  Joi.string().max(200).allow(['', null])
    });

    function getAssinaturaVigente( empresaID ) {
        return new Promise( ( resolve, reject ) => {
            mysql.query(`SELECT * FROM v_assinatura WHERE empresa_id = ? ORDER BY id DESC LIMIT 1`, [empresaID], (err, result) => {
                if( err || !result ) return reject('erro interno do servidor');
                if( result.length === 0 ) return reject('Assinatura não encontrada');
                if( result[0].status == '5' || result[0].status == '6' ) {
                    return callback('A assinatura não esta ativa');
                }
                resolve( result[0] );
            });
        });
    }

    /**
     * Para ser usado nas validações que inser ou atualiza PROFISSIONAIS
     * 
     * Checa se a lista de profissionais [profissional_id, usuario_id] existe e NÃO é de demonstração
     * Se for selecionado TODO
     * 
     * @param {int} empresaID PK da empresa
     * @param {string} profissional Se é para ativar os recursos pró para os profissionais 'selecionado' OU para 'todos'
     * @param {array} profissionais array de array contendo o ID do profissional e o ID do usuário, nessa ordem
     */
    function checaProfissionais ( empresaID, profissional, profissionais ) {
        return new Promise( ( resolve, reject ) => {
            if( profissional == 'todos') { // pega todos os profissionais, exceto os de demonstração
                mysql.query("SELECT id, usuario_id FROM profissional WHERE empresa_id = ? AND (demo IS NULL OR demo = 'n' )", [empresaID], (err, result) => {
                    if (err || !result ) return reject('erro interno do servidor');
                    if( result.length == 0 ) return reject('Não há profissional ativo');
                    let retorno = result.map( p => [p.id, p.usuario_id]);// coloca os ids de profissional e de usuário

                    resolve( retorno );
                });
            } else { // selecionado   
                mysql.query("SELECT id, ativo, demo FROM profissional WHERE empresa_id = ? AND (id, usuario_id) IN (?)", [ empresaID, profissionais ], (err, result) => {
                    if (err) return reject('erro interno do servidor');
                    if (result.length == 0) return reject('O(s) profissional(is) selecionado(s) não existe(m)');

                    if( profissionais.length != result.length ) {
                        return reject({profissionais: 'Inconsistência nos profissionais'});                 
                    }

                    // verifica se o usuário esta inativo OU se é de demonstração
                    let errosProfissional = {};
                    for (const p of result ) {
                        if( p.demo == 's' ) {
                            errosProfissional[p.id] = 'profissional de demonstração';
                            continue;
                        }
                    }

                    if( Object.keys( errosProfissional ).length > 0 ) {
                        return reject({profissionais: errosProfissional});
                    }
                    
                    resolve( profissionais );
                });
            }
        });
    }


    /**
     * Valida a assinatura, o ato de assinar
     */
    function validaAssinatura(empresaID, usuario, dados ) {
        return new Promise( (resolve, reject) => {
            if( !usuario || !_.isObject( usuario )) {
                return reject('Acesso não autorizado');
            }
            if( !usuario.perfil || usuario.perfil != 'a') {
                return reject('Acesso não autorizado');
            }

            let _dados;
            const validacaoInicial = ( callback ) => {
                const schema = Joi.object().options({ abortEarly: false }).keys({
                    nome:           Joi.string().min(2).max(150).allow(['', null]),
                    razao_social:   Joi.string().min(2).max(150),
                    fone:           Joi.number().integer().positive().min(1).required(),
                    email:          Joi.string().email().max(100).required(),
                    nascimento:     Joi.date().iso().max('now').raw().required(),
                    tipo_responsavel:Joi.string().regex(/^(pj|pf)$/).required(),
                    // cpf_cnpj:       Joi.string().min(11).max(14).required().when('tipo_responsavel', { is: 'pf', then: Joi.string().regex(/[0-9]{11}$/, 'CPF inválido'), otherwise: Joi.string().regex(/[0-9]{14}$/, 'CNPJ inválido') }),
                    cpf_cnpj:       Joi.alternatives().try(
                        Joi.string().regex(/[0-9]{11}$/, 'inválido'),
                        Joi.string().regex(/[0-9]{14}$/, 'inválido'),
                    ),
                    profissional:   Joi.string().regex(/^(todos|selecionado)$/).required(),
                    endereco:       schemaEndereco,
                    tipo_pg:      Joi.string().regex(/^boleto|cartão|depósito$/).required(),
                }).when(Joi.object({ profissional: 'selecionado' }).unknown(), {
                    then: Joi.object({
                        profissionais: Joi.array().options({ abortEarly: false }).items(
                            Joi.array().items(
                                Joi.number().positive().integer().min(1), // profissional_id
                                Joi.number().positive().integer().min(1) // usuario_id
                            )
                        ).min(1).unique((a, b)=> {return a[0] === b[0];})
                    }),
                    otherwise: Joi.object({
                        profissionais: Joi.any().strip()
                    })
                });

                Joi.validate(dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    
                    // validação complementar do CPF
                    if( value.tipo_responsavel == 'pf' && value.cpf_cnpj && value.cpf_cnpj.length != 11) {
                        erros.cpf_cnpj = 'CPF inválido';
                    }
                    // validação complementar do CNPJ
                    if( value.tipo_responsavel == 'pj' && value.cpf_cnpj && value.cpf_cnpj.length != 14) {
                        erros.cpf_cnpj = 'CNPJ inválido';
                    }

                    if( !value.cpf_cnpj ) erros.cpf_cnpj = 'Obrigatório';

                    if(_.isEmpty(erros)) {
                        // remove o número se o mesmo estiver vazio, evita erro
                        if( _.isEmpty(value.endereco.numero)) {
                            delete  value.endereco.numero;
                        }
                        if( _.isEmpty(value.endereco.complemento)) {
                            delete  value.endereco.complemento;
                        }
                        _dados = value;
                        return callback();
                    }
                    return callback(erros);
                });
            };
            
            const profissionais = ( callback ) => {
                checaProfissionais( empresaID, dados.profissional, dados.profissionais ).then( ( profissionais ) => {
                    _dados.profissionais = profissionais;
                    callback();
                }).catch( (erro) => {
                    callback( erro );
                });
            };

            /**
             * Verifica se há assinatura vigente
             */
            const assinaturaVigente = ( callback ) => {
                mysql.query(`SELECT id, status FROM v_assinatura WHERE empresa_id = ? ORDER BY id DESC LIMIT 1`, [empresaID], (err, result) => {
                    if( err || !result ) return callback('erro interno do servidor');
                    if( result.length === 0 ) return callback();
                    if( result[0].status == '5' || result[0].status == '6' ) {
                        return callback();
                    }
                    callback('Você tem assinatura vigente');
                });
            };

            const faturasAtrasadas = ( callback ) => {
                mysql.query(`SELECT count(*) AS total FROM v_fatura WHERE empresa_id = ? AND status IN ('cr', 'at', 'pp', 'np')`, [empresaID], (err, result) => {
                    if( err || !result ) return callback('erro interno do servidor');
                    if( result.length > 0 && result[0].total > 0 ) return callback('Você tem débito pendente');
                    callback();
                });
            };

            const processaEmParalelo = ( callback ) => {
                async.parallel([
                    profissionais,
                    assinaturaVigente,
                    faturasAtrasadas
                ], (err, result) => {
                    callback( err );
                });
            };

            // processa
            async.series([
                validacaoInicial,
                processaEmParalelo
            ], (err, result) => {
                if (err) return reject(err);
                resolve( _dados  );
            });
        });
    } // validaAssinatura

    /**
     * Valida a alteração de endereço de cobrança
     */
    function validaEndereco(empresaID, usuario, endereco ) {
        return new Promise( (resolve, reject) => {
            if( !usuario || !_.isObject( usuario )) {
                return reject('Acesso não autorizado');
            }
            if( !usuario.perfil || usuario.perfil != 'a') {
                return reject('Acesso não autorizado');
            }

            let _dados, assinaturaID;
            const validacaoInicial = ( callback ) => {
                Joi.validate(endereco, schemaEndereco, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if(_.isEmpty(erros)) {
                        // remove o número se o mesmo estiver vazio, evita erro
                        if( _.isEmpty(value.numero)) {
                            delete  value.numero;
                        }
                        if( _.isEmpty(value.complemento)) {
                            delete  value.complemento;
                        }
                        _dados = value;
                        return callback();
                    }
                    return callback(erros);
                });
            };
            
            /**
             * Verifica se há assinatura vigente
             */
            const assinaturaVigente = ( callback ) => {
                getAssinaturaVigente( empresaID ).then( assinatura => {
                    assinaturaID = assinatura.id;
                    callback();
                }).catch( erro => callback( erro ) );
            };

            // processa
            async.series([
                validacaoInicial,
                assinaturaVigente
            ], (err, result) => {
                if (err) return reject(err);
                resolve( { endereco: _dados, assinaturaID: assinaturaID } );
            });
        });
    } // validaEndereco

    /**
     * Valida a alteração dos dados básicos de cobrança
     */
    function validaDados(empresaID, usuario, dados ) {
        return new Promise( (resolve, reject) => {
            if( !usuario || !_.isObject( usuario )) {
                return reject('Acesso não autorizado');
            }
            if( !usuario.perfil || usuario.perfil != 'a') {
                return reject('Acesso não autorizado');
            }
            let _dados, assinaturaID, profissional, ass_config_id;

            const schema = Joi.object().options({ abortEarly: false }).keys({
                nome:           Joi.string().min(2).max(150).allow(['', null]),
                razao_social:   Joi.string().min(2).max(150),
                fone:           Joi.number().integer().positive().min(1).required(),
                email:          Joi.string().email().max(100).required(),
                nascimento:     Joi.date().iso().max('now').raw().required(),
                tipo_pg:        Joi.string().regex(/^boleto|cartão|depósito$/).required(),
                tipo_responsavel:Joi.string().regex(/^(pj|pf)$/).required(),
                cpf_cnpj:       Joi.alternatives().try(
                    Joi.string().regex(/[0-9]{11}$/, 'inválido'),
                    Joi.string().regex(/[0-9]{14}$/, 'inválido'),
                )
            });

            const validacaoInicial = ( callback ) => {
                Joi.validate(dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);

                    // validação complementar do CPF
                    if( value.tipo_responsavel == 'pf' && value.cpf_cnpj.length != 11) {
                        erros.cpf_cnpj = 'CPF inválido';
                    }
                    // validação complementar do CNPJ
                    if( value.tipo_responsavel == 'pj' && value.cpf_cnpj.length != 14) {
                        erros.cpf_cnpj = 'CNPJ inválido';
                    }

                    if( !value.cpf_cnpj ) erros.cpf_cnpj = 'Obrigatório';

                    if(_.isEmpty(erros)) {
                        _dados = value;
                        return callback();
                    }
                    return callback(erros);
                });
            };
            
            /**
             * Verifica se há assinatura vigente
             */
            const assinaturaVigente = ( callback ) => {
                getAssinaturaVigente( empresaID ).then( assinatura => {
                    assinaturaID = assinatura.id;
                    profissional = assinatura.profissional;
                    ass_config_id = assinatura.config_id;
                    callback();
                }).catch( erro => callback( erro ) );
            };
  
            // processa
            async.series([
                validacaoInicial,
                assinaturaVigente
            ], (err, result) => {
                if (err) return reject(err);
                resolve( {
                    dados: _dados, 
                    assinaturaID: assinaturaID, 
                    profissional: profissional, 
                    ass_config_id: ass_config_id 
                } );
            });
        });
    } // validaDados


    /**
     * Valida a alteração dos dados básicos de cobrança
     */
    function validaProfissionais(empresaID, usuario, dados ) {
        return new Promise( (resolve, reject) => {
            if( !usuario || !_.isObject( usuario )) {
                return reject('Acesso não autorizado');
            }
            if( !usuario.perfil || usuario.perfil != 'a') {
                return reject('Acesso não autorizado');
            }
            let _dados, assinaturaConfig;

            const schema = Joi.object().options({ abortEarly: false }).keys({
                profissional:   Joi.string().regex(/^(todos|selecionado)$/).required(),
            }).when(Joi.object({ profissional: 'selecionado' }).unknown(), {
                then: Joi.object({
                    profissionais: Joi.array().options({ abortEarly: false }).items(
                        Joi.array().items(
                            Joi.number().positive().integer().min(1), // profissional_id
                            Joi.number().positive().integer().min(1) // usuario_id
                        )
                    ).min(1).unique((a, b)=> {return a[0] === b[0];})
                }),
                otherwise: Joi.object({
                    profissionais: Joi.any().strip()
                })
            });

            const validacaoInicial = ( callback ) => {
                Joi.validate(dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if(_.isEmpty(erros)) {
                        _dados = value;
                        return callback();
                    }
                    return callback(erros);
                });
            };
            
            /**
             * Verifica se há assinatura vigente
             */
            const assinaturaVigente = ( callback ) => {
                getAssinaturaVigente( empresaID ).then( assinatura => {
                    assinaturaConfig = assinatura;
                    callback();
                }).catch( erro => callback( erro ) );
            };

            const profissionais = ( callback ) => {
                checaProfissionais( empresaID, dados.profissional, dados.profissionais ).then( ( profissionais ) => {
                    _dados.profissionais = profissionais;
                    callback();
                }).catch( (erro) => {
                    callback( erro );
                });
            };
  
            // processa
            async.series([
                validacaoInicial,
                assinaturaVigente,
                profissionais
            ], (err, result) => {
                if (err) return reject(err);
                resolve( {
                    dados: _dados,
                    assinaturaConfig: assinaturaConfig 
                } );
            });
        });
    } // validaProfissionais
 

    exports.validaAssinatura = validaAssinatura;
    exports.validaEndereco = validaEndereco;
    exports.validaDados = validaDados;
    exports.validaProfissionais = validaProfissionais;
}());