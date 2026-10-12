;(function () {
    "use strict";
    
    const Joi = require("joi"),
        mysql = require('src/util/conexoes.js'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        async = require('async'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;
    

    /**
     * Verifica se a empresa assinou o plano PRÓ e se o profissional em questão
     * está autorizado a usar os recursos
     */
    function checaAssinatura ( empresaID, profissionalID ) {
        return new Promise( ( resolve, reject ) => {
        assinaturaUtil.getCacheAssinatura( empresaID )
            .then( assinatura => {
                let erroAssinatura = {
                    assinatura: true,
                    bloqueadoPra: assinatura.plano  == 'pró' ? 'me' : 'todos',
                    tipoErro: undefined
                };

                if( assinatura.plano == 'gratis' ) {
                    return reject( erroAssinatura );
                }

                if( assinatura.plano == 'pró') {
                    if(assinatura.status == '4') { // conta bloqueada
                        erroAssinatura.tipoErro = 'contaBloqueada';
                        return reject( erroAssinatura );
                    }
                    if( assinatura.profissional == 'todos') return resolve(); // ativo para todos os profissionais
                    if( !assinatura.profissionais.includes(profissionalID) ) { // não esta ativo para esse profissional
                        return reject( erroAssinatura );
                    }
                }
                resolve();
            })
            .catch( erro => callback ( erro ) );
        });
    }

    /**
     * Verifica se o atendimento existe, caso o mesmo tenha sido informado
     */
    function atendimentoExiste( empresaID, atendimentoID, callback ) {
        if( !atendimentoID ) return callback();
        mysql.query(`SELECT status FROM atendimento WHERE empresa_id = ? AND id = ? LIMIT 1`, [ empresaID, atendimentoID ], ( erro, result ) => {
            if( erro || !result ) return callback('Erro interno');
            if( result.length === 0 ) return callback('O atendimento não existe');
            if( result[0].status != '4' && result[0].status != '5') return callback('O atendimento deve estar com o status "Atendido" ou "Em atendimento"');
            callback();
        });
    }

    function pacienteExiste( empresaID, clienteID, callback ) {
        mysql.query(`SELECT count(*) AS total FROM cliente WHERE empresa_id = ? AND id = ?`, [ empresaID, clienteID ], ( erro, result ) => {
            if( erro || !result ) return callback('Erro interno');
            if( result.length === 0 ) return callback('Paciente sem prontuário');
            if( result[0].total === 0 ) return callback('Paciente sem prontuário');
            callback();
        });
    }
    
    function valida(empresaID, user, dados) {
        return new Promise( (resolve, reject) => {
            if(user.perfil != 'p') return reject('Você não tem permissão');
            
            const schema = Joi.object().options({ abortEarly: false }).keys({
                pacienteID:         Joi.number().integer().positive().required(),
                atendimentoID:      Joi.number().integer().positive().allow([null, '']),
                prontuarioID:       Joi.number().integer().positive().allow([null, '']),
                imprimirImagens:    Joi.boolean().required(),
                imprimirCabecalho:  Joi.boolean().required(),
                imprimirRodape:     Joi.boolean().required(),
                imprimirPaciente:   Joi.boolean().required()
            });
            
            Joi.validate(dados, schema, (err, value) => {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    
                    async.parallel({
                        contaAtiva: ( callback ) => {
                            checaAssinatura( empresaID, user.profissional_id ).then( result => {
                                callback();
                            }).catch( erro => {
                                callback( erro );
                            });
                        },
                        atendimento: ( callback ) => {
                            atendimentoExiste( empresaID, dados.atendimentoID || null, callback );
                        },
                        paciente: ( callback ) => {
                            pacienteExiste( empresaID, dados.pacienteID, callback );
                        }
                    },
                    (err) => {
                        if(err) return reject(err);
                        resolve(value);
                    });
                    
                }else return reject(erros);
            });
        });
    }
 

    exports.valida = valida;
}());