
(function () {
    "use strict";

    const
        mysql = require('src/util/conexoes.js'),
        async = require('async'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        Joi = require("joi");


    const schemaPagamento = Joi.object().options({ abortEarly: false }).keys({
        fatura_id:        Joi.number().integer().min(1).required(),
        assinatura_id:    Joi.number().integer().min(1).required(),
        valor:            Joi.number().min(1).required(),
        dt_pagamento:     Joi.date().iso().max('now').raw().required(),
        forma_pg:         Joi.string().regex(/^(cartão|boleto|depósito|outro)$/).required(),
        forma_pg_interna: Joi.string().max(50).allow([null, '']),
        comprovante:      Joi.string().max(300).allow([null, ''])
    });

    /**
     * Verifica se a fatura e a assinatura existem e, opcionalmente checa se a
     * fatura já esta paga
     * 
     * Retorna dados da fatura em caso de sucesso que será usado em outro local
     * 
     * @param {int} assinaturaID PK assinatura
     * @param {int} faturaID PK da fatura
     * @param {boolean} ignorarStatusFatura se é para ignorar o status da fatura, ou seja, não verificar se já foi pago
     * @param {function} callback função de retorno async
     */
    function assinaturaEFaturaExistem( assinaturaID, faturaID, ignorarStatusFatura ) {
        return new Promise( ( resolve, reject ) => {

            mysql.query(`SELECT * FROM v_fatura WHERE id = ? LIMIT 1`, [ faturaID ], (erro, result) => {
                if( erro || !result ) return reject('Erro interno ao checar assinatura');
                if( result.length === 0 ) return reject({fatura_id: 'Fatura não encontrada'});
                if( result[0].assinatura_id != assinaturaID ) return reject({assinatura_id: 'Assinatura não encontrada'});
                if( ignorarStatusFatura === false && result[0].status == 'pt' ) return reject({fatura_paga: true, valor_recebido: result[0].valor_recebido});
                resolve( result[0] );
            });
        });
    }


    /**
     * valida o registro de um pagamento feito
     * REQUISITOS
     * - possuir uma assinatura
     * - possuir uma fatura para essa assinatura
     * - passar na validação básica (schema)
     */
    function validaFaturaPagamento( dados, ignorarStatusFatura ) {
        return new Promise( (resolve, reject) => {
            if( _.isUndefined( ignorarStatusFatura ) || !_.isBoolean( ignorarStatusFatura ) ) {
                ignorarStatusFatura = false;
            }

            let _dados, info;
            const validacaoInicial = ( callback ) => {
                Joi.validate(dados, schemaPagamento, (err, value) => {
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
            const checaAssinaturaEFatura = ( callback ) => {
                assinaturaEFaturaExistem( _dados.assinatura_id, _dados.fatura_id, ignorarStatusFatura )
                .then( informacao => {
                    info = informacao;
                    callback();
                }).catch( erro => callback( erro ));
            };

            // processa
            async.series([
                validacaoInicial,
                checaAssinaturaEFatura
            ], (err, result) => {
                if (err) return reject(err);
                resolve( {pagamento: _dados, info: info}  );
            });
        });
    } // validaFaturaPagamento

    /**
     * 
     */
    function validaMudancaStatusFatura( dados ) {
        return new Promise( (resolve, reject) => {
            const schema = Joi.object().options({ abortEarly: false }).keys({
                assinatura_id:  Joi.number().integer().min(1).required(),
                fatura_id:      Joi.number().integer().min(1).required(),
                status:         Joi.string().regex(/^(cr|at|pt|pp|pe|ca|np)$/).required(),
                ativa_conta:    Joi.boolean().allow([null, '']),
                obs_interna:    Joi.string().max(500).allow([null, '']),
                enviaEmailAoCliente: Joi.boolean().allow([null, ''])
            });

            let _dados, info;
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
            const checaAssinaturaEFatura = ( callback ) => {
                let ignorarStatusFatura = true;
                assinaturaEFaturaExistem( _dados.assinatura_id, _dados.fatura_id, ignorarStatusFatura )
                .then( informacao => {
                    info = informacao;
                    callback();
                }).catch( erro => callback( erro ));
            };

            // processa
            async.series([
                validacaoInicial,
                checaAssinaturaEFatura
            ], (err, result) => {
                if (err) return reject(err);
                resolve( {dados: _dados, info: info}  );
            });
        });
    } // validaMudancaStatusFatura    



    /**
     * Valida a mudança de status de ASSINATURA
     * 
     * CHECAGEM
     * - Se for cancelar, e a fatura NÃO estiver BLOQUEADA, só permitir mediante confirmação
     * - Somente a ultima assinatura pode ficar ATIVA
     */
    function validaMudancaStatusAssinatura( dados ) {
        return new Promise( (resolve, reject) => {
            let _dados;

            const schema = Joi.object().options({ abortEarly: false }).keys({
                empresa_id:         Joi.number().integer().min(1).required(),
                assinatura_id:      Joi.number().integer().min(1).required(),
                status:             Joi.string().regex(/^(1|2|3|4|5|6)$/).required(),
                obs_interna:        Joi.string().max(500).allow([null, '']),
                enviaEmailAoCliente:Joi.boolean().allow([null, '']),
                confirmeCancelamento:Joi.boolean().allow([null, ''])
            });

            const validacaoInicial = ( callback ) => {
                Joi.validate(dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if( dados.status && dados.status == '6') erros.status = 'Inválido';// só o cliente pode alterar para esse status
                    if(_.isEmpty(erros)) {
                        _dados = value;
                        return callback();
                    }
                    return callback(erros);
                });
            };

            /**
             * Verifica se a assinatura pode ser alterada
             */
            const podeAlterarAssinatura = ( callback ) => {
                mysql.query(`SELECT a.id, a.status, a.profissional, a.config_id, a.email, a.nome, a.dt_cadastro, a.tipo_pg,
                b.u_id
                FROM v_assinatura a,
                (SELECT u.id AS u_id FROM v_assinatura u WHERE u.empresa_id = ? ORDER BY u.id DESC LIMIT 1) b
                WHERE id = ? ORDER BY id DESC LIMIT 1`, [ _dados.empresa_id, _dados.assinatura_id ], (erro, result ) => {
                    if( erro ) return callback({geral: 'Erro ao localizar a assinatura'});
                    if( !result || result.length === 0 ) return callback({assinatura: 'Essa assinatura não existe OU pertence a outra empresa'});

                    let re = result[0];
                    if( re.status == _dados.status ) return callback( {status: 'Selecione um status diferente'} );// o novo status é igual ao status atual
                    
                    // apenas a ultima assintura aceita qualquer status, as demais apenas o status cancelado (5)
                    if( re.id != re.u_id && _dados.status != '5' ) {
                        return callback({ assinatura: 'Essa assinatura não pode ser REATIVADA. Apenas a assinatura mais recente pode ser reativada.' });   
                    }

                    /**
                     * Para cancelar uma assinatura não BLOQUEADA é necessário 
                     * confirmar que deseja realizar a alteração
                     */
                    let confirmeCancelamento = _dados.confirmeCancelamento ? _dados.confirmeCancelamento : false;
                    if( _dados.status == '5' && re.status != '4' && !confirmeCancelamento ) {
                        return callback({confirmeCancelamento: true});
                    }

                    _dados.statusAnterior = re.status;
                    _dados.profissional = re.profissional;
                    _dados.config_id = re.config_id;
                    _dados.email = re.email;
                    _dados.nome = re.nome;
                    _dados.dt_cadastro = re.dt_cadastro;
                    _dados.tipo_pg = re.tipo_pg;
                    callback();
                });
            };

            // processa
            async.series([
                validacaoInicial,
                podeAlterarAssinatura
            ], (err, result) => {
                if (err) return reject(err);
                resolve( _dados );
            });
        });
    } // validaMudancaStatusAssinatura   


    /**
     * Valida a criação de uma fatura
     */
    function validaCriarFatura( dados ) {
        return new Promise( (resolve, reject) => {
            let _dados;

            const schema = Joi.object().options({ abortEarly: false }).keys({
                empresa_id:         Joi.number().integer().min(1).required(),
                assinatura_id:      Joi.number().integer().min(1).required(),
                dt_inicio:          Joi.date().iso().raw().required(),
                dt_fim:             Joi.date().iso().raw().required(),
                dt_vencimento:      Joi.date().iso().raw().required(),
                status:             Joi.string().regex(/^(cr|at|pt|pp|pe|ca|np)$/).required(),
                link_pg:            Joi.string().uri().max(300).allow([null, '']),
                obs_interna:        Joi.string().max(500).allow([null, '']),
                custo_cobranca:     Joi.number().min(0).precision(2).allow(['', null]).default(null),
                enviaEmailAoCliente:Joi.boolean().allow([null, '']),
                itens: Joi.array().items(
                    Joi.object().options({ abortEarly: false }).keys({
                        descricao:  Joi.string().min(3).max(150).required(),
                        valor:      Joi.number().precision(2).required(),
                        complemento:Joi.string().max(45).allow([null, ''])
                    })
                ).required().min(1).unique('descricao')
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
             * Verifica se a assinatura pode ser alterada
             */
            const assinaturaExiste = ( callback ) => {
                mysql.query(`SELECT nome, email FROM v_assinatura WHERE empresa_id = ? AND id = ?`, [ _dados.empresa_id, _dados.assinatura_id ], ( erro, result ) => {
                    if( erro ) return callback('Erro interno VAL-1');
                    if( !result ) return callback('Não foi possível checar a assinatura');
                    if( result.length === 0 ) return callback({assinatura_id: 'Assinatura não localizada'});
                    _dados.nome = result[0].nome;
                    _dados.email = result[0].email;
                    callback();
                });
            };

            // processa
            async.series([
                validacaoInicial,
                assinaturaExiste
            ], (err, result) => {
                if (err) return reject(err);
                resolve( _dados );
            });
        });
    } // validaCriarFatura   

    exports.validaFaturaPagamento = validaFaturaPagamento;
    exports.validaMudancaStatusFatura = validaMudancaStatusFatura;
    exports.validaMudancaStatusAssinatura = validaMudancaStatusAssinatura;
    exports.validaCriarFatura = validaCriarFatura;
}());