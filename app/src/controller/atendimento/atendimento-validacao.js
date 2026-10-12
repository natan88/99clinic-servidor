;(function () {
    "use strict";

    const prontuarioValidacao = require('src/controller/prontuario/prontuario-validacao'),
        async = require('async'),
        Joi = require("joi"),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        mysql = require('src/util/conexoes.js'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;


    /**
     * Verifica se o profissional pode "preencher/usar" uma seção de prontuário
     * 
     * REGRAS:
     * - PLANO GRÁTIS
     *   - permitido apenas seções com apenas 1 campo, sendo este do tipo "texto longo"
     *   - se houver mais de uma seção com apenas 1 campo de "texto longo", apenas o que tiver a ordem de exibição mais alta pode ser usado
     * 
     * - PLANO PRÓ
     *   - não há restrição se tiver sido contrado para o profissional logado (para "todos" ou se o profissional logado tiver na lista de permitidos)
     *   - se os recursos não tiverem ativos para o profissional logado, aplicar a regra do plano GRÁTIS
     * 
     * RETORNO
     * {
     *    assinatura: true,
     *    bloqueadoPra: '', me | todos
     *    tipoErro: '', contaBloqueada | campoProntuarioLimit | campoProntuario | prontuarioNaoPermitido
     * }
     * obs: tipoErro abaixo são usados apenas no plano grátis ou quando não o profissional não esta autorizado a usar os recursos pró
     * campoProntuarioLimit     = quando a seção de prontuário tem mais de 1 campo
     * campoProntuario          = o prontuário tem 1 campo, mas o tipo do campo não é 'Texto longo'
     * prontuarioNaoPermitido   = o prontuário não pode ser usado pelo profissional. Apesar de ter apenas 1 campo do tipo "Texto Longo", há outro seção com a mesma condição e por tanto apenas o que aparece primeiro pode ser usado
     * 
     * 
     * @param {int} empresaID PK da empresa
     * @param {int} profissionalID PK do profissional logado
     * @param {int} prontuarioID PK do prontuário que esta sendo preenchido
     */
    function planoAssinatura( empresaID, profissionalID, prontuarioID ) {
        return new Promise( ( resolve, reject ) => {
            assinaturaUtil.getCacheAssinatura( empresaID )
            .then( assinatura => {
                let erroAssinatura = {
                    assinatura: true,
                    bloqueadoPra: assinatura.plano  == 'pró' ? 'me' : 'todos',
                    tipoErro: undefined
                };

                if( assinatura.plano == 'pró') {
                    if(assinatura.status == '4') { // conta bloqueada
                        erroAssinatura.tipoErro = 'contaBloqueada';
                        return reject( erroAssinatura );
                    }
                    if( assinatura.profissional == 'todos') return resolve(); // ativo para todos os profissionais
                    if( assinatura.profissionais.includes(profissionalID) ) return resolve(); // ativo para o profissional logado
                }
                

                // plano gratuito OU pró com profissional não autorizado a usar recurso pró
                // verifica se há mais de 1 prontuário para o profissional com apenas 1 campo de "texto longo"
                mysql.query(`SELECT p.id AS p_id, p.ordem, c.tipo FROM prontuario p 
                LEFT JOIN prontuario_item c ON (c.prontuario_id = p.id AND (c.excluido IS NULL OR c.excluido='n'))
                LEFT JOIN prontuario_item c2 ON (c2.id = c.id AND c.versao < c2.versao AND (c.excluido IS NULL OR c.excluido='n'))
                WHERE p.empresa_id = ? AND p.profissional_id = ? AND p.ativo = 's' AND c2.id IS NULL AND (p.excluido IS NULL OR p.excluido='n')
                ORDER BY p.ordem ASC, c.id DESC;`, 
                [empresaID, profissionalID], (err, result)=> {
                    if( err || !result ) return reject('Erro interno ao verificar seu plano');
                    let agrupado = _.groupBy( result, 'p_id' );


                    let temp;                    
                    let encontrou = false;
                    let secaoEmEdicao = agrupado[prontuarioID];

                    // verifica se o campo que esta sendo preenchido é permitido
                    // (tem apenas 1 campo, sendo este do tipo "texto longo")
                    if( secaoEmEdicao ) {
                        if( secaoEmEdicao.length != 1 ) { // seção com mais de 1 campo
                            erroAssinatura.tipoErro = 'campoProntuarioLimit';
                            return reject( erroAssinatura );
                        }
                        if( secaoEmEdicao[0].tipo != 'textarea' ) { // seção com apenas 1 campo, porém o campo não é do tipo "texto longo"
                            erroAssinatura.tipoErro = 'campoProntuario';
                            return reject( erroAssinatura );
                        }
                    } else {
                        return reject('A seção de prontuário que você esta preenchendo parece não existir.');
                    }

                    /**
                     * Se houver mais de uma seção com apenas 1 campo de "texto longo",
                     * permitir preenchencher apenas o mais antigo (o que tiver sido ordenado para a posição mais alta)
                     */
                    for (const r in agrupado ) {
                        temp = agrupado[r];
                        if( temp.length > 1 ) continue;

                        if( temp[0].tipo == 'textarea' && temp[0].ordem < secaoEmEdicao[0].ordem ) {
                            encontrou = true;
                            break;
                        }
                    }

                    // if( encontrou && encontrouID != prontuarioID ) {
                    if( encontrou ) {
                        erroAssinatura.tipoErro = 'prontuarioNaoPermitido';
                        return reject( erroAssinatura );
                    }

                    resolve();
                });
            }).catch( erro => {
                reject( erro );
            });
        });
    }

    /**
     * Verifica se a empresa é assinate, se o plano está ativo e
     * se o profissional tem o plano pró
     * 
     */
    function profissionalEAssinante ( empresaID, profissionalID ) {
        return new Promise( (resolve, reject) => {
            assinaturaUtil.getCacheAssinatura( empresaID )
            .then( assinatura => {
                if( assinatura.plano != 'pró' ) {
                    return reject('Recurso disponível apenas para assinantes');
                }

                if(assinatura.status == '4') { // conta bloqueada
                    return reject('conta bloqueada');
                }
                if( assinatura.profissional == 'todos') return resolve(); // ativo para todos os profissionais

                // se o usuário for profissional, verifica se o mesmo tem ou não o plano pró ativo
                if( !assinatura.profissionais.includes( profissionalID ) ) { // não esta ativo para esse profissional
                    return reject('Recurso disponível apenas para assinantes');
                }
                resolve();
            })
            .catch( erro => {
                reject('Erro interno');
            });
        });
    }

    function checaAtendimentoParaAnexo ( empresaID, profissionalID, atendimentoID ) {
        return new Promise( ( resolve, reject ) => {
            mysql.query(`SELECT status, cliente_id FROM atendimento WHERE empresa_id = ? AND profissional_id = ? AND id = ? LIMIT 1`, 
            [empresaID, profissionalID, atendimentoID], ( err, result ) => {
                if( err || !result ) return reject('Atendimento não localizado');
                if( result.length === 0 ) return reject('Atendimento não localizado');
                if( result[0].status !== '4' && result[0].status !== '5' ) return reject('Atendimento não iniciado');
                let atm_concluido = result[0].status === '5' ? 's' : 'n';
                resolve( { status: result[0].status, atm_concluido: atm_concluido, cliente_id: result[0].cliente_id } );
            });
        });
    }

    /**
     * Objetivo: verificar se o preenchimento de uma seção de prontuário esta
     * correto, ou seja, se atende todos os requisitos abaixo:
     * 
     * REGRAS
     * - o atendimento deve PERTENCER ao usuário que esta fazendo a operação
     * - o atendimento existe e esta com o status 'EM ATENDIMENTO'
     * - a seção de prontuário deve existir
     * - os campos devem esta com resposta válida de acordo com o tipo de cada campo
     * - 
     */
    function validaResposta( empresaID, user, prontuarioID, atendimentoID, campos ) {
        return new Promise( ( resolve, reject )=> {
            if( user.perfil != 'p' ) return reject('Apenas profissional pode realizar um atendimento');
            let profissionalID, clienteID, _campos;

            // ETAPAS 
            const prontuario = ( calback ) => {
                prontuarioValidacao.validaGenerico( empresaID, user.id, prontuarioID )
                .then( _profissionalID => { 
                    profissionalID = _profissionalID;
                    calback();
                })
                .catch( err => calback( err ) );
            };

            const atendimento = ( callback ) => {
                mysql.query(`SELECT status, cliente_id FROM atendimento WHERE empresa_id = ? AND profissional_id = ? AND id = ? LIMIT 1`, 
                [empresaID, profissionalID, atendimentoID], ( err, result ) => {
                    if( err || !result ) return callback('Atendimento não localizado');
                    if( result.length == 0 ) return callback('Atendimento não localizado');
                    if( result[0].status < 4 ) return callback('Atendimento não iniciado');
                    if( result[0].status == 5 ) return callback('Atendimento encerrado não permite alterar o prontuário');
                    
                    clienteID = result[0].cliente_id;
                    callback();
                });
            };

            const respostasCampos = ( callback ) => {
                const schemaResposta = {
                    text: Joi.string().required(),
                    number: Joi.number().required(),
                    date: Joi.date().required(),
                    money: Joi.number().required(),

                    checkbox: Joi.array().items(
                        Joi.object().keys({
                            value: Joi.string().required(),
                            checked: Joi.boolean().required()
                        }).min(1)
                    ).min(1),
                    pa: Joi.object().keys({
                        sistolica: Joi.number().integer().positive().multiple(1).min(1),
                        diastolica: Joi.number().integer().positive().multiple(1).min(1),
                        frequencia: Joi.number().integer().positive().multiple(1).min(1),
                        status: Joi.string().lowercase().regex(/^(normal|baixa|alta)$/, "Status inválido")
                    }).min(1),
                    po: Joi.object().keys({
                        nota: Joi.string().min(1),
                        perto: Joi.object().keys({
                            od: Joi.object().keys({
                                esferico: Joi.string().min(1),
                                cilindro: Joi.string().min(1),
                                eixo: Joi.string().min(1),
                                dnp: Joi.string().min(1)
                            }).min(1),
                            oe: Joi.object().keys({
                                esferico: Joi.string().min(1),
                                cilindro: Joi.string().min(1),
                                eixo: Joi.string().min(1),
                                dnp: Joi.string().min(1)
                            }).min(1)
                        }).min(1),
                        longe: Joi.object().keys({
                            od: Joi.object().keys({
                                esferico: Joi.string().min(1),
                                cilindro: Joi.string().min(1),
                                eixo: Joi.string().min(1),
                                dnp: Joi.string().min(1)
                            }).min(1),
                            oe: Joi.object().keys({
                                esferico: Joi.string().min(1),
                                cilindro: Joi.string().min(1),
                                eixo: Joi.string().min(1),
                                dnp: Joi.string().min(1)
                            }).min(1)
                        }).min(1)
                    }).min(1).max(3)
                };

                const schema = Joi.array().options({ abortEarly: false }).items(
                    Joi.object().options({ abortEarly: false }).keys({
                        id: Joi.number().integer().positive().required(),
                        tipo: Joi.string().lowercase().regex(/^(text|textarea|number|money|email|phone|date|checkbox|radio|select|pa|po)$/, 'Tipo inválido').required(),
                        resposta: Joi.alternatives()
                            .when('tipo', {is: 'text',      then: schemaResposta.text})
                            .when('tipo', {is: 'textarea',  then: schemaResposta.text})
                            .when('tipo', {is: 'email',     then: schemaResposta.text})
                            .when('tipo', {is: 'phone',     then: schemaResposta.text})
                            .when('tipo', {is: 'select',    then: schemaResposta.text})
                            .when('tipo', {is: 'checkbox',  then: schemaResposta.checkbox})
                            .when('tipo', {is: 'radio',     then: schemaResposta.checkbox})
                            .when('tipo', {is: 'money',     then: schemaResposta.money})
                            .when('tipo', {is: 'number',    then: schemaResposta.number})
                            .when('tipo', {is: 'date',      then: schemaResposta.date})
                            .when('tipo', {is: 'pa',        then: schemaResposta.pa})
                            .when('tipo', {is: 'po',        then: schemaResposta.po})
                    })
                ).required().unique('id');

                Joi.validate( campos, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if(!_.isEmpty(erros)) {
                        return callback(erros);
                    }
                    _campos = value;
                    respostasCamposDB( callback );
                });

            };

            // passo 2 dos campos, checa o banco para ver se o mesmo existe e para pegar a versão dos campos
            const respostasCamposDB = ( callback ) =>  {
                if( campos.length === 0) return callback();
                let ids = campos.reduce( (acc, cur ) => {
                    acc.push( cur.id );
                    return acc;
                }, []);

                mysql.query(`SELECT id, versao FROM prontuario_item WHERE empresa_id = ? AND prontuario_id = ? AND id IN (?) AND (excluido IS NULL OR excluido='n')`, 
                [empresaID, prontuarioID, ids], (err, result) => {
                    if( err || !result ) return callback('Não foi possível validar os campos');
                    if( result.length !== ids.length ) return callback('Inconsistência nos campos, alguns parecem não existir');

                    // acrescenta a versão aos dados de cada campo
                    let c;
                    for (const r of result) {
                        c = _campos.find( ca => ca.id === r.id );
                        if( !c ) continue;
                        c.versao = r.versao;
                    }

                    callback();
                });
            };

            const Assinatura = ( callback ) => {
                planoAssinatura( empresaID, user.profissional_id, prontuarioID ).then( result => {
                    callback();
                }).catch( erro => {
                    callback( erro );
                });
            };

            // PROCESSA
            async.series([
                prontuario, atendimento, respostasCampos, Assinatura
            ], (err, result) => {
                if( err ) return reject( err );
                resolve( {profissional_id: profissionalID, cliente_id: clienteID, campos: _campos} );
            });
        });
    }

        

    /**
     * Valida a etapa 1 do envio de anexos
     * 
     * REGRAS
     * - Apenas profissional
     * - o profissional deve ser o dono do atendimento
     * - o atendimento deve existir
     * - o atendimento deve está com o status "em atendimento" (4) ou "atendido" (5)
     * - o profissional deve ser assinante do plano PRÓ
     * 
     */
    function validaAnexosEtapaUm ( empresaID, user, atendimentoID, dados ) {
        return new Promise( function (resolve, reject) {
            if( user.perfil !== 'p' ) return reject('Apenas profissional pode anexar arquivos');
            let _dados;

            const schemaAnexos = Joi.object().options({ abortEarly: false }).keys({
                id_local:   Joi.string().max(20).required(),
                tipo:       Joi.string().lowercase().max(10).required(),
                nome:       Joi.string().min(3).max(100).required(),
                descricao:  Joi.string().max(300).allow(['', null])
            });

            const ValidacaoInicial = ( callback ) => {
                Joi.validate( dados, schemaAnexos, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if(!_.isEmpty(erros)) {
                        return callback(erros);
                    }
                    if( _.isEmpty( value.descricao )) delete value.descricao;
                    _dados = value;
                    callback();
                });
            }

            const Assinatura = ( callback ) => {
                profissionalEAssinante(user.empresa_id, user.profissional_id)
                .then( () => callback())
                .catch( erro => callback( erro ));
            }

            const Atendimento = ( callback ) => {
                checaAtendimentoParaAnexo ( empresaID, user.profissional_id, atendimentoID )
                .then( result => {
                    _dados.atm_concluido = result.atm_concluido;
                    _dados.cliente_id = result.cliente_id;
                    callback();
                })
                .catch( erro => callback( erro ));
            };

            // PROCESSA
            async.series([
                ValidacaoInicial, Assinatura, Atendimento
            ], (err, result) => {
                if( err ) return reject( err );
                resolve( _dados );
            });
        });
    }


    /**
     * Essa função é um middleware do express, para checar se o envio do arquivo está permitido
     * 
     * REGRAS
     * - As mesmas da função 'validaAnexosEtapaUm' (exceto validação incial) mais:
     * - o anexo deve ter sido registrado na etapa anterior, e deve está com a coluna 'estagio' igual a 'i'
     */
    function validaAnexosEtapaDoisExpress ( req, res, next ) {
        let user = req.user;
        let dados = {};
        let query = req.query || {} ; 
        
        if( user.perfil !== 'p' ) return res.send('Apenas profissional pode anexar arquivos');
                
        dados.atendimentoID = query.atendimentoID || null;
        dados.anexoID = query.anexoID || null;
        
        const schema = Joi.object().options({ abortEarly: false }).keys({
            atendimentoID:  Joi.number().integer().positive().required(),
            anexoID:        Joi.number().integer().positive().required()
        });
        

        const ValidacaoInicial = ( callback ) => {
            Joi.validate( dados, schema, (err, value) => {
                let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                if(!_.isEmpty(erros)) {
                    return callback(erros);
                }
                req.dados = value;
                callback();
            });
        }
        
        const Assinatura = ( callback ) => {
            profissionalEAssinante(user.empresa_id, user.profissional_id)
            .then( () => callback())
            .catch( erro => callback( erro ));
        }
        
        const Atendimento = ( callback ) => {
            checaAtendimentoParaAnexo ( user.empresa_id, user.profissional_id, dados.atendimentoID )
            .then( result => callback())
            .catch( erro => callback( erro ));
        };

        const Anexo = ( callback ) => {
            mysql.query(`SELECT estagio FROM atendimento_anexo WHERE empresa_id = ? AND atendimento_id = ? AND id = ? LIMIT 1`, [ user.empresa_id, dados.atendimentoID, dados.anexoID ], ( err, result ) => {
                if ( err || !result ) return callback ( 'Erro ao verificar dados' );
                if ( result.length === 0 ) return callback ( 'Anexo não localizado' );
                if ( result[0].estagio !== 'i' ) return callback('O arquivo já foi enviado antes');
                callback();
            });
        };
        
        // PROCESSA
        async.series([
            ValidacaoInicial, Assinatura, Atendimento, Anexo
        ], (err, result) => {
            if( err ) return res.send( err );
            next();
        });
    }

    /**
     * Está sendo usado ao remover o arquivo
     * 
     * REGRAS
     * - As mesmas da função 'validaAnexosEtapaUm' (exceto validação incial) mais:
     */
    function validaAnexosGenerico ( user, atendimentoID, anexoIdLocal, anexoID ) {
        return new Promise( ( resolve, reject ) => {
            if( user.perfil !== 'p' ) return reject('Apenas profissional tem permissão');
            let estagioAnexo, atendimentoConcluido, atmStatus, arquivo, atmConcluidoAnexo;

            const ValidacaoInicial = ( callback ) => {
                if( !atendimentoID ) return callback( 'Solicitação inválida. Parâmetro obrigatório faltando' );
                if( !anexoIdLocal || !/^[0-9]+\-[0-9]{1,2}$/.test( anexoIdLocal ) ) return callback( 'Solicitação inválida. Parâmetro obrigatório faltando' );
                callback();
            }
            
            const Assinatura = ( callback ) => {
                profissionalEAssinante(user.empresa_id, user.profissional_id)
                .then( () => callback())
                .catch( erro => callback( erro ));
            }

            const Anexo = ( callback ) => {
                let where = 'empresa_id = ? AND atendimento_id = ? AND id_local = ?';
                let cols = [ user.empresa_id, atendimentoID, anexoIdLocal ];

                if( anexoID && _.isNumber( anexoID ) ) {
                    where += ' AND id = ?';
                    cols.push( anexoID );
                }

                mysql.query(`SELECT estagio, arquivo, atm_concluido FROM atendimento_anexo WHERE ${where} LIMIT 1`, cols, ( err, result ) => {
                    if ( err || !result ) return callback ( 'Erro ao verificar dados' );
                    if ( result.length === 0 ) return callback ( 'Anexo não localizado' );

                    estagioAnexo = result[0].estagio;
                    arquivo = result[0].arquivo;
                    atmConcluidoAnexo = result[0].atm_concluido;
                    callback();
                });
            };
            
            const Atendimento = ( callback ) => {
                checaAtendimentoParaAnexo ( user.empresa_id, user.profissional_id, atendimentoID )
                .then( result => {
                    if( atmConcluidoAnexo !== 's' && result.atm_concluido === 's' ) return callback ('O atendimento não pode está concluído');
                    atendimentoConcluido = result.atm_concluido;
                    atmStatus = result.status;
                    callback();
                })
                .catch( erro => callback( erro ));
            };
            
            // PROCESSA
            async.series([
                ValidacaoInicial, Assinatura, Anexo, Atendimento
            ], (err, result) => {
                if( err ) return reject( err );
                resolve( { estagioAnexo: estagioAnexo, atendimentoConcluido: atendimentoConcluido, arquivo: arquivo } );
            });
        });
    }


    /**
     * Atualiza o nome e a descrição de um anexo
     * 
     * REGRA
     * - se o anexo foi adicionado antes do atendimento ter sido concluído, o atendimento deve está com status 4
     * - se o anexo foi adicionado depois do atendiment ter sico concluído, o atendimento deve está com status 5
     * - o atendimento deve existir e está com status 4 ou 5 (em atendimento ou atendido)
     */
    function validaAtualizaNomeDescricaoAnexo ( user, dados ) {
        return new Promise( ( resolve, reject ) => {
            if( user.perfil !== 'p' ) return reject('Apenas profissional tem permissão');
            let atmStatus, _dados;

            const schema = Joi.object().options({ abortEarly: false }).keys({
                atendimentoID:  Joi.number().integer().positive().required(),
                anexoID:        Joi.number().integer().positive().allow(null),
                anexoIdLocal:   Joi.string().regex(/^[0-9]+\-[0-9]{1,2}$/, "Status inválido").required(),
                nome:           Joi.string().max(50).required(),
                descricao:      Joi.string().max(500).allow([null, ''])
            });
    
            const ValidacaoInicial = ( callback ) => {
                Joi.validate( dados, schema, (err, value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, true);
                    if(!_.isEmpty(erros)) {
                        return callback(erros);
                    }
                    _dados = value;
                    callback();
                });
            }
            
            const Atendimento = ( callback ) => {
                checaAtendimentoParaAnexo ( user.empresa_id, user.profissional_id, _dados.atendimentoID )
                .then( result => {
                    atmStatus = result.status;
                    callback();
                })
                .catch( erro => callback( erro ));
            };

            const Anexo = ( callback ) => {
                let where = 'empresa_id = ? AND atendimento_id = ? AND id_local = ?';
                let cols = [ user.empresa_id, _dados.atendimentoID, _dados.anexoIdLocal ];

                if( _dados.anexoID && _.isNumber( _dados.anexoID ) ) {
                    where += ' AND id = ?';
                    cols.push( _dados.anexoID );
                }

                mysql.query(`SELECT atm_concluido FROM atendimento_anexo WHERE ${where} LIMIT 1`, cols, ( err, result ) => {
                    if ( err || !result ) return callback ( 'Erro ao verificar dados' );
                    if ( result.length === 0 ) return callback ( 'Anexo não localizado' );

                    if( result[0].atm_concluido != 's' && atmStatus == '5' ) {
                        return callback('Não pode atualizar os dados depois de concluir o atendimento');
                    }

                    callback();
                });
            };
            
            // PROCESSA
            async.series([
                ValidacaoInicial, Atendimento, Anexo
            ], (err, result) => {
                if( err ) return reject( err );
                resolve( _dados );
            });
        });
    }

    exports.validaResposta = validaResposta;
    exports.validaAnexosEtapaUm = validaAnexosEtapaUm;
    exports.validaAnexosEtapaDoisExpress = validaAnexosEtapaDoisExpress;
    exports.validaAnexosGenerico = validaAnexosGenerico;
    exports.validaAtualizaNomeDescricaoAnexo = validaAtualizaNomeDescricaoAnexo;
}());