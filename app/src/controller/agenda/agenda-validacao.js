(function () {
    "use strict";

    const 
        mysql = require('src/util/conexoes.js'),
        moment = require('moment'),
        async = require('async'),
        MyUtil = require("src/util/util.js"),
        _ = require("underscore"),
        Joi = require("joi"),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil;

    //moment.locale('pt-BR'); // agora esta em inglês
    
    /*
     * Verifica se o profissional atende no hoário e dia especificado
     */
    function medicoAtendeHorario(medicoID, empresaID, data, callback) {
        let _data = moment(data);
        let dia = _data.format('ddd');       
        let hora = _data.format("HH:mm:ss");
        mysql.query("SELECT count(*) AS total FROM profissional_horario WHERE profissional_id = ? AND empresa_id = ? AND dia = ? AND de <= CAST(? AS time) AND a >= CAST(? AS time)", [medicoID, empresaID, dia, hora, hora], function (err, result) {
            if (err)
                return callback('erro interno do servidor');
            if (result[0].total === 0)
                return callback('O profissional não atende nesse horário');
            callback();
        });
    }


    /**
     * Determina se o agendamento que será marcado deve ser 'gravado' como 'demo'
     * Deve ser 'demo' se: paciente, serviço ou profissional for 'demo'
     */
    function eDemo(empresaID, medicoID, servicoID, pacienteID, callback) {
        let demo = false;

        async.series({
            medico: (callback) => {
                mysql.query("SELECT count(*) AS total FROM profissional WHERE id = ? AND empresa_id = ? AND demo = ?", [medicoID, empresaID, 's'], (err, result) => {
                    if (err) return callback('erro interno do servidor');
                    demo = result[0].total > 0 || demo;
                    callback();
                });
            },
            paciente: (callback) => {
                mysql.query("SELECT count(*) AS total FROM cliente WHERE id = ? AND empresa_id = ? AND demo = ?", [pacienteID, empresaID, 's'], (err, result) => {
                    if (err) return callback('erro interno do servidor');
                    demo = result[0].total > 0 || demo;
                    callback();
                });
            },
            servico: (callback) => {
                mysql.query("SELECT count(*) AS total FROM servico WHERE id = ? AND empresa_id = ? AND demo = ?", [pacienteID, empresaID, 's'], (err, result) => {
                    if (err) return callback('erro interno do servidor');
                    demo = result[0].total > 0 || demo;
                    callback();
                });
            }
        }, 
        (err) => {
            callback( err, demo );
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
    
    // verifica se o MÉDICO pertence a empresa
    // verifica se o SERVIÇO pertencem a empresa
    // verifica se o serviço esta ativo
    // verifica se o médico realiza o serviço
    // verifica se o médico esta ativo
    // 
    // verifica se a data é válida
    // verifica se a data e horário do médico esta livre
    // verifica se o médico trabalha no dia e hora informados
    function valida(empresaID, agenda) {
        return new Promise(function (resolve, reject) {
            let _agenda;
            const validacaoInicial = function (callback) {
                const schema = Joi.object().options({ abortEarly: false }).keys({
                    atendimentoID:  Joi.number().positive().allow(['', null]),// id do atendimento de origem, isso significa que este atendimento será um RETORNO
                    clienteID:      Joi.number().positive().required(),
                    servicoID:      Joi.number().positive().required(),
                    medicoID:       Joi.number().positive().required(),
                    convenioID:     Joi.number().positive().allow([null]),
                    status:         Joi.number().positive().min(1).max(8).required(),
                    data:           Joi.date().required(),
                    obs:            Joi.string().allow(['', null]),
                    preferencia_prof: Joi.string().regex(/^(s|n)$/).allow(['', null]),
                    convenio_cod:   Joi.string().max(50).allow(['', null]),
                    
                    pg_valor:       Joi.number().min(0).precision(2).allow(['', null]).default(null),
                    desconto:       Joi.number().min(0).precision(2).allow(['', null]).default(null),
                    acrescimo:      Joi.number().min(0).precision(2).allow(['', null]).default(null),
                    pg_dt:          Joi.date().allow(['', null]).default(null),
                    pg_dt_cheque:   Joi.date().allow(['', null]).default(null),
                    pg_forma:       Joi.string().regex(/^(dinheiro|cheque|cartão crédito|cartão débito|convênio|outro)$/).allow(['', null]).default(null),
                    pg_parcelas:    Joi.number().positive().allow(['', null]).default(null).when('pg_forma', { is: 'cartão crédito', then: Joi.required(), otherwise: Joi.valid(null) }),
                    pg_obs:         Joi.string().allow(['', null]).default(null)
                });//.with('pg_valor', ['pg_dt', 'pg_forma']).and('convenioID', 'convenio_cod');

                Joi.validate(agenda, schema, function (err, value) {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                    
                    if(parseInt(value.pg_valor) > 0 && _.isEmpty(value.pg_forma) )  erros.pg_forma = 'obrigatório';
                    if(parseInt(value.pg_valor) > 0 && !value.pg_dt )               erros.pg_dt = 'obrigatório';
                    if(value.pg_forma == 'cheque' && !value.pg_dt_cheque )          erros.pg_dt_cheque = 'obrigatório';
                    if(value.pg_forma == 'cartão crédito' && !value.pg_parcelas )   erros.pg_parcelas = 'obrigatório';
                    if(value.pg_forma && !value.pg_valor )                          erros.pg_valor = 'Obrigatório se a forma de pagamento foi informado';
                    if(value.pg_dt && !value.pg_valor)                              erros.pg_dt = 'Se não há pagamento, deixe em branco';
                    // a nova regra não aceita agendar para os status 'em atendimento' e 'atendido', esses status só pode ser alcançados mediante atualização na área do profissional
                    if( value.status == 4 || value.status == 5 ) erros.status = 'inválido'; 
                    
                    if(_.isEmpty(erros)) {
                        _agenda = value;
                        // foi comentado, pois não é mais obrigatório informar o convenio_code quando foi informado o convenio_id
                        // if(value.convenioID && !value.convenio_cod) return callback({convenio_cod: 'Obrigatório'});
                        callback();
                    }else return callback(erros);
                });
            };
            
            let srv;
            const servico = function (callback) {
                mysql.query("SELECT nome, valor, tempo FROM servico WHERE empresa_id = ? AND id = ? LIMIT 1", [empresaID, agenda.servicoID], function (err, result) {
                    if (err) return callback('erro interno do servidor');
                    if (result.length == 0)
                        return callback('O serviço não existe');
                    srv = result[0];
                    callback();
                });
            };
            
//            let comissao;
//            const Comissao = function (callback) {
//                mysql.query("SELECT nome, valor FROM servico WHERE empresa_id = ? AND id = ? LIMIT 1", [empresaID, agenda.servicoID, agenda.medicoID], function (err, result) {
//                    if (err) return callback('erro interno do servidor');
//                    if (result.length == 0)
//                        return callback('O serviço não existe');
//                    srv = result[0];
//                    callback();
//                });
//            };
            
            let comissao = 0;
            const medicoExiste = function (callback) {
                const query = `SELECT valor FROM profissional_has_servico s 
                             RIGHT JOIN profissional p ON (p.id = s.profissional_id) 
                             WHERE s.profissional_id = ? AND s.servico_id = ? AND p.empresa_id = ? AND p.ativo='s' LIMIT 1`;
                mysql.query(query, [agenda.medicoID, agenda.servicoID, empresaID], function (err, result) {
                    
                    if (err) return callback('erro interno do servidor');
                    if (!result || result.length == 0) return callback('O profissional não existe ou não esta ativo');
                    comissao = result[0].valor;
                    callback();
                });
            };

            const medicoHorario = function (callback) {
                medicoAtendeHorario(agenda.medicoID, empresaID, agenda.data, callback);
            };
            
            /* APENAS em caso de retorno
             * Verifica se o atendimento de origem do retorno já tem outro retorno
             */
            const jaTemRetorno = function (callback) {
                if(!_.has(agenda, 'atendimentoID')) return callback();
                let idAt = parseInt(agenda.atendimentoID);
                if(idAt <= 0) return callback();
                
                mysql.query("SELECT f_retornos_atendimento(?) AS ja_tem", [idAt], function (err, result) {
                    if (err)
                        return callback('erro interno do servidor');
                    if (result[0].ja_tem > 0)
                        return callback('Não é possível agendar mais de um retorno por atendimento');
                    callback();
                });
            };

            const marcarComoDemo = ( callback ) => {
                eDemo(empresaID, agenda.medicoID, agenda.servicoID, agenda.clienteID, callback);
            };

            const contaAtiva = ( callback ) => {
                contaBloqueada( empresaID, callback );
            };

            //parallel series
            // async.parallel([validacaoInicial, servico, medicoExiste, medicoHorario, jaTemRetorno, marcarComoDemo
            async.parallel({
                inicial: validacaoInicial, 
                srv: servico, 
                mdEx: medicoExiste, 
                mH: medicoHorario, 
                temRetorno: jaTemRetorno, 
                demo: marcarComoDemo,
                conta: contaAtiva
            }, function (err, result) {
                if (err) return reject(err);
                if( result.demo ) _agenda.demo = 's';
                return resolve({agenda: _agenda, 'srv': srv, comissao: comissao});
            });
        });
    }
    
    /*
     * Verificar:
     * - Se o serviço pertence a empresa
     * - se todos os dados estão corretos
     */
    function validaPagamento(empresaID, atendimentoID, pagamento) {
        return new Promise(function (resolve, reject) {
            const schema = Joi.object().options({ abortEarly: false }).keys({
                desconto:       Joi.number().min(0).precision(2).allow(['', null]).default(null),
                acrescimo:      Joi.number().min(0).precision(2).allow(['', null]).default(null),
                pg_valor:       Joi.number().min(0).precision(2).allow(['', null]).default(null),
                pg_forma:       Joi.string().regex(/^(dinheiro|cheque|cartão crédito|cartão débito|convênio|outro)$/).allow(['', null]).default(null),
                pg_dt:          Joi.date().allow(['', null]).default(null),
                pg_dt_cheque:   Joi.date().allow(['', null]).default(null),
                pg_parcelas:    Joi.number().positive().allow(['', null]).default(null),
                pg_obs:         Joi.string().allow(['', null]).default(null),
                convenio_cod:   Joi.string().max(50).allow(['', null]).default(null)
            });
            
            Joi.validate(pagamento, schema, function (err, value) {
                let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                if(_.isEmpty(erros)) {
                    mysql.query('SELECT count(*) AS total FROM atendimento WHERE id = ? AND empresa_id = ?', [atendimentoID, empresaID], function(err, result){
                        if(err) return reject('Erro interno');
                        if (!result || result[0].total == 0) return reject('Atendimento não localizado');
                        
                        erros = {};
                        if(parseInt(value.pg_valor) > 0 && _.isEmpty(value.pg_forma) )  erros.pg_forma = 'obrigatório';
                        if(parseInt(value.pg_valor) > 0 && !value.pg_dt )               erros.pg_dt = 'obrigatório';
                        if(value.pg_forma == 'cheque' && !value.pg_dt_cheque )          erros.pg_dt_cheque = 'obrigatório';
                        if(value.pg_forma == 'convênio' && !value.convenio_cod )        erros.convenio_cod = 'obrigatório';
                        if(value.pg_forma == 'cartão crédito' && !value.pg_parcelas )   erros.pg_parcelas = 'obrigatório';
                        if(value.pg_forma && !value.pg_valor )                          erros.pg_valor = 'Obrigatório se a forma de pagamento foi informado';
                        if(value.pg_dt && !value.pg_valor)                              erros.pg_dt = 'Se não há pagamento, deixe em branco';
                        
                        if(_.isEmpty(erros)) return resolve(value);
                        else return reject(erros);
                    });
                }else return reject(erros);
            });
        });
    }
    
    /*
     * Valida a atualização de um atendimento
     * - Verificar também se: A DATA e hora
     * - Retornar o status_antigo
     */
    function validaAtualizacao(empresaID, user, atendimentoID, dados) {
        return new Promise(function (resolve, reject) {
            let value;
            
            const Valida = (callback) => {
                const schema = Joi.object().options({ abortEarly: false }).keys({
                    profissionalID: Joi.number().positive().required().strip(),
                    convenioID:     Joi.number().positive().allow([null]),
                    convenio_cod:   Joi.string().max(50).allow(['', null]),
                    status:         Joi.number().positive().min(1).max(8).required(),
                    data:           Joi.date().required(),
                    obs:            Joi.string().allow(['', null]),
                    preferencia_prof: Joi.string().regex(/^(s|n)$/).allow(['', null])
                });

                Joi.validate(dados, schema, (err, _value) => {
                    let erros = MyUtil.tratarErroValidacaoJoi(err, false);
                    if(_.isEmpty(erros)) {
                        value = _value;
                        // não é obrigatório informar o código do convênio quado o convênio foi selecionado
                        // if(value.convenioID && !value.convenio_cod) return callback({convenio_cod: 'Obrigatório'});
                        callback();
                    }else callback(erros);
                });
            };
            
            let statusAtual, demo;
            const AtendimentoExiste = (callback) => {
                // caso essa função seja executada antes de 'Valida'
                if( !dados.status ) return callback({status: 'obrigatório'});
                
                mysql.query('SELECT status, profissional_id, demo FROM atendimento WHERE id = ? AND empresa_id = ? LIMIT 1', [atendimentoID, empresaID], (err, result) => {
                    if( err || !result ) return callback('Erro interno');
                    if( result.length === 0 ) return callback('Esse atendimento parece não existir');
                    statusAtual = result[0].status;
                    demo = result[0].demo;
                    if( statusAtual == 5 ) return callback('Atendimento concluído não pode ser alterado');

                    // apenas se houver mudança de status
                    if(dados.status != statusAtual)  {
                        if( dados.status == 4 || dados.status == 5 ) {
                            // let statusT = dados.status == 4 ? "'Em atendimento'" : "'Atendido'";
                            // if( user.perfil != 'p' ) return reject("Somente profissionais podem alterar o status para: "+ statusT );
                            // if( user.profissional_id != result[0].profissional_id ) {
                            //     return callback("Somente o profissional pode alterar o status para: "+ statusT );
                            // }

                            return callback('Alteração disponível somente na área de atendimento');
                        }

                        if( statusAtual == 4 ) return callback('Atendimento em andamento, usar a opção CONCLUIR');
                    }
                    // fim apenas se houver mudança de status

                    callback();
                });
            };

            const Horario = (callback) => {
                medicoAtendeHorario(dados.profissionalID, empresaID, dados.data, callback);
            };

            const contaAtiva = ( callback ) => {
                contaBloqueada( empresaID, callback );
            };

            //parallel series
            async.parallel([Valida, AtendimentoExiste, Horario, contaAtiva], (err) => {
                if (err) return reject(err);
                value.status_atual = statusAtual;
                value.demo = demo;
                return resolve(value);
            });
        });
    }

    exports.valida = valida;
    exports.validaPagamento = validaPagamento;
    exports.validaAtualizacao = validaAtualizacao;
}());