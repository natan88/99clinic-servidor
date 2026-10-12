
{
    "use strict";

    const GCalendar = require('src/lib/calendario/googleCalendario.js'),
    log = require('src/util/logInterno'),
    _ = require('underscore'),
    redis = require('src/util/conexoes').redis(),
    mysql = require('src/util/conexoes.js'),
    moment = require('moment'),
    async = require('async'),
    assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil,
    conf = require('src/util/config');

    class AgendaUtil {
        constructor () {
            this.tempoSessaoRedis = 60 * 50; // 1 hora (um pouco menos). O token do google dura 1 hora
            this.chaveRedis = 'google_calendar:{empresaID}:{profissionalID}';
        }

        /**
         * Assim que o profissional configura a agenda do google,
         * enviamos para o google calendar todos os agendamentos recentes
         * ou seja, aqueles agendados para até 7 dias atrás, não há data limite 
         * dos agendamentos futuros
         */
        criaAgendamentosRecentesGoogle( empresaID, profissionalID, agendaGoogleID, fusoHorario, token ) {
            
            if( !empresaID || !profissionalID || !agendaGoogleID || !token) return;

            //DATE(dt_agenda) >= DATE(DATE_SUB( now(), INTERVAL 1 DAY ))
            
            mysql.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.dt_agenda AS data, s.nome AS servico, s.tempo AS servicoTempo, 
            IFNULL(c.nome, 'Particular') AS convenio, p.nome AS paciente 
            FROM atendimento a
            LEFT JOIN convenio c ON (c.id = a.convenio_id)
            LEFT JOIN servico s ON (s.id = a.servico_id)
            LEFT JOIN cliente p ON (p.id = a.cliente_id)
            WHERE a.empresa_id = ? AND a.profissional_id = ? AND a.demo !='s' AND DATE(dt_agenda) >= DATE(now())`, 
        [ empresaID, profissionalID ], (err, atendimentos) => {
            if( err || !atendimentos ) return;
            if( atendimentos.length === 0 ) return;
            
            let agenda, status;

            for (const atm of atendimentos ) {
                status = this._getStatusNomeAtendimento( parseInt( atm.status) );

                agenda = {
                    id: `${empresaID}a${profissionalID}a${atm.id}`,
                    summary: atm.paciente,
                    description: `<b>Serviço:</b>      ${atm.servico} \n<b>Convênio:</b>   ${atm.convenio || 'Particular'} \n<b>Status:</b>        ${status} \n<b>ID:</b>               ${atm.id}\n\n<a href="${conf.url_site}/atendimentos?id=${atm.id}">Ver detalhes</a>`,
                    source: {
                        title: '99Clinic',
                        url: `${conf.url_site}/atendimentos?id=${atm.id}`
                    },
                    start: {
                        dateTime: moment.utc(atm.data).format('YYYY-MM-DDTHH:mm:ss'),
                        timeZone: fusoHorario
                    },
                    end: {
                        dateTime: moment.utc( atm.data ).add( atm.servicoTempo, 'minutes' ).format('YYYY-MM-DDTHH:mm:ss'),
                        timeZone: fusoHorario
                    }
                };

                GCalendar.criaEvento( token.access_token, agendaGoogleID, agenda ).then( _agenda => {})
                .catch( err => {});
            }

            
        });
        }

        /**
         * Verifica se o token não foi expirado. Se tiver expirado, renova o token
         * @param {Object} token 
         * @returns {Promise<Object>} retorna o token
         */
        _tokenValido( empresaID, profissionalID, token ) {
            
            return new Promise( ( resolve, reject ) => {
                if( !token || !_.isObject( token )) return reject('Credenciais não definidas');
                GCalendar.getTokenInfo( token.token )
                .then( info => {
                    resolve( token );
                })
                .catch( erro => {

                    // outros erros: invalid_grant, checar se mais erros deve ser incluídos na verificação abaixo
                    if( !['invalid_token'].includes( erro.error ) ) {
                        this._removeAutorizacaoDB ( empresaID, profissionalID, usuarioID, token );
                        return reject( 'ERR IMPOSSÍVEL DE CONTORNAR - ' + erro.error );
                    }

                    // dependendo do tipo de erro, renova o token
                    GCalendar.renovaToken( token.refresh_token ).then( novoToken => {
                        token.token = novoToken.access_token;
                        token.expiry = moment.utc( novoToken.expiry_date ).format('YYYY-MM-DD HH:mm:ss');
                        
                        resolve( token );

                        // atualiza o cache no redis
                        this.agendaGoogleConfigurada( empresaID, profissionalID, token );

                        // atualiza o mysql
                        mysql.query(`UPDATE google_agenda SET token = ?, expiry = ? WHERE empresa_id = ? AND profissional_id = ? AND id = ?`, [ token.token, token.expiry, empresaID, profissionalID, token.id ], ( err,result) => {
                        });

                    }).catch( erro2 => {
                        reject( erro2 );
                    })
                });
            });
        }

        /**
         * Verifica se a agenda que foi criada pelo 99Clinic no momento da autorização
         * ainda existe. Se Não existir, desconsidera a integração desfeita, ou seja, revoga a integração
         */
        _agendaAindaExisteNoGoogle( empresaID, profissionalID, usuarioID, token ) {
            return new Promise( ( resolve, reject ) => {
                GCalendar.getCalendario( token.token, token.agenda_id )
                .then( agenda => {
                    if( !agenda ) {
                        this._removeAutorizacaoDB( empresaID, profissionalID, usuarioID, token );
                        return reject();
                    }
                    resolve( agenda );
                })
                .catch( erro => {
                    reject( erro );
                    this._removeAutorizacaoDB( empresaID, profissionalID, usuarioID, token );
                });
            });
        }

        /**
         * Quando é identificado que a agenda não existe mais no google, removemos a agenda
         * para que não seja mais
         */
        _removeAutorizacaoDB ( empresaID, profissionalID, usuarioID, token ) {
            // remove os registros anteriores, mas preserva o último agendamento
            mysql.query(`DELETE FROM google_agenda WHERE empresa_id = ? AND profissional_id = ? AND ativo = 'n' AND id != ?`, [ empresaID, profissionalID, token.agenda_id ], (err, result) => {
            });

            // Atualiza a sincronização que acabou de ser inativada
            // estou preservando esse dados para sabermos quem já utilizou
            mysql.query(`UPDATE FROM google_agenda SET ativo = 'n', dt_inativou = NOW() WHERE empresa_id = ? AND profissional_id = ? AND id = ?`, [ empresaID, profissionalID, token.agenda_id ], ( err,result) => {
            });

            this.agendaGoogleRemovida( empresaID, profissionalID );

            // TODO: avisar o profissional por e-mail
        }

        _getStatusNomeAtendimento( status ) {
            let retorno = '';
            switch (status) {
                case 1:
                    retorno = 'Agendado';
                    break;
                case 2:
                    retorno = 'Confirmado';
                    break;
                case 3:
                    retorno = 'Na recepção';
                    break;
                case 4:
                    retorno = 'Em atendimento';
                    break;
                case 5:
                    retorno = 'Atendido';
                    break;
                case 6:
                    retorno = 'Cancelado';
                    break;
                case 7:
                    retorno = 'Faltou';
                    break;
                case 8:
                    retorno = 'Encaminhado';
                    break;
            
                default:
                    retorno = 'Indefinido';
                    break;
            }

            return retorno;
        }

        _getDadosAgenda( empresaID, pacienteID, convenioID, status ) {
            return new Promise( ( resolve, reject ) => {

                async.parallel({
                    paciente: ( callback ) => {
                        mysql.query(`SELECT nome FROM cliente WHERE empresa_id = ? AND id = ?`, [empresaID, pacienteID], ( err, result ) => {
                            if( err || !result ) return callback('Não foi possível pegar dados do paciente');
                            if( result.length === 0 ) return callback('Paciente não encontrado');
                            callback( null, result[0] );
                        });
                    },
                    convenio: ( callback ) => {
                        if( !convenioID ) return callback( null, 'Particular');

                        mysql.query(`SELECT nome FROM convenio WHERE empresa_id = ? AND id = ?`, [empresaID, convenioID], ( err, result ) => {
                            if( err || !result ) return callback('Não foi possível pegar dados do convênio');
                            if( result.length === 0 ) return callback('Convênio não encontrado');
                            callback( null, result[0].nome );
                        });
                    },
                    status: ( callback ) => {
                        callback( null, this._getStatusNomeAtendimento( status ));
                       },
                }, (erro, result) => {
                    if( erro ) return reject( erro );
                    resolve( result );
                });
            });
        }

        /**
         * Depois que um agendamento é criado, cria o agendamento no google Calendar
         */
        criaAgendamentoNoGoogleCalendar( empresaID, profissionalID, usuarioID, agenda ) {

            let token, agendaGoogle;
            this.profissionalComAgendaGoogle( empresaID, profissionalID )
            .then( _token => {
                token = _token;
                return this._tokenValido( empresaID, profissionalID, token );
            })
            .then( novoToken => {
                token = novoToken;
                return assinaturaUtil.profissionalEAssinante( empresaID, profissionalID );
            })
            .then( result => {
                return this._agendaAindaExisteNoGoogle( empresaID, profissionalID, usuarioID, token );
            })
            .then( _agendaGoogle => {
                agendaGoogle = _agendaGoogle;
                return this._getDadosAgenda( empresaID, agenda.clienteID, agenda.convenioID, agenda.status );
            })
            .then( dadosAgenda => { // fim das verificações, criar enviar o agendamento para o google calendar
                
                let _agenda = {
                    id: `${empresaID}a${profissionalID}a${agenda.id}`,
                    summary: dadosAgenda.paciente.nome,
                    description: `<b>Serviço:</b>      ${agenda.servicoNome} \n<b>Convênio:</b>   ${dadosAgenda.convenio} \n<b>Status:</b>        ${dadosAgenda.status} \n<b>ID:</b>               ${agenda.id} \n\n<a href="${conf.url_site}/atendimentos?id=${agenda.id}">Ver detalhes</a>`,
                    source: {
                        title: '99Clinic',
                        url: `${conf.url_site}/atendimentos?id=${agenda.id}`
                    },
                    start: {
                        dateTime: moment.utc(agenda.data).format('YYYY-MM-DDTHH:mm:ss'),// formato: '2019-11-20T09:00:00-03:00'
                        timeZone: agendaGoogle.timeZone
                    },
                    end: {
                        dateTime: moment.utc( agenda.data ).add( agenda.servicoTempo, 'minutes' ).format('YYYY-MM-DDTHH:mm:ss'),
                        timeZone: agendaGoogle.timeZone
                    }
                };

                GCalendar.criaEvento( token.token, token.agenda_id, _agenda )
                .then( result => {})
                .catch( erro => {});
            })
            .catch( erro => {
            });
        }

        /**
         * Atualiza a agenda
         * @param {Integer} empresaID PK da empresa
         * @param {Integer} profissionalID PK do profissional
         * @param {Integer} usuarioID PK do usuário
         * @param {Object} agenda Dados da agenda
         */
        atualizaAgendamentoNoGoogleCalendar( empresaID, profissionalID, usuarioID, agenda ) {
            let eventoID = `${empresaID}a${profissionalID}a${agenda.id}`;

            let token, agendaGoogle;
            this.profissionalComAgendaGoogle( empresaID, profissionalID )
            .then( _token => {
                token = _token;
                return this._tokenValido( empresaID, profissionalID, token );
            })
            .then( novoToken => {
                token = novoToken;
                return assinaturaUtil.profissionalEAssinante( empresaID, profissionalID );
            })
            .then( result => {
                return this._agendaAindaExisteNoGoogle( empresaID, profissionalID, usuarioID, token );
            })
            .then( _agendaGoogle => {
                agendaGoogle = _agendaGoogle;
                return GCalendar.getEvento( token.token, token.agenda_id, eventoID );
            })
            .then( evento => { // fim das verificações, criar enviar o agendamento para o google calendar
                let status = this._getStatusNomeAtendimento( parseInt(agenda.status) );

                let _agenda = {
                    description: `<b>Serviço:</b>      ${agenda.procedimento} \n<b>Convênio:</b>   ${agenda.convenio || 'Particular'} \n<b>Status:</b>        ${status} \n<b>ID:</b>               ${agenda.id} \n\n<a href="${conf.url_site}/atendimentos?id=${agenda.id}" title="Abrir no 99Clinic.com">Ver detalhes</a>`,
                };

                if( agenda.data && agenda.servicoTempo ) {
                    _agenda.start = {
                        dateTime: moment.utc( agenda.data ).format('YYYY-MM-DDTHH:mm:ss'),// formato: '2019-11-20T09:00:00-03:00'
                        timeZone: agendaGoogle.timeZone
                    };
                    _agenda.end = {
                        dateTime: moment.utc( agenda.data ).add( agenda.servicoTempo, 'minutes' ).format('YYYY-MM-DDTHH:mm:ss'),
                        timeZone: agendaGoogle.timeZone
                    };
                }

                GCalendar.atualizaParcialEvento( token.token, token.agenda_id, eventoID, _agenda )
                .then( result => {})
                .catch( erro => {});
            })
            .catch( erro => {
            });
        }

        /**
         * Verifica no cache se o profissional está com a agenda do google
         * configurada
         * OBS: Não verifica se o profissional é assinante
         * 
         * @param {Integer} empresaID PK da empresa
         * @param {Integer} profissionalID PK do profissional
         * @returns(Promise<token>) retorna o token de acesso e o token de atualização (refresh_token)
         */
        profissionalComAgendaGoogle( empresaID, profissionalID ) {
            return new Promise( ( resolve, reject ) => {
                let chave = this._getChaveRedis( empresaID, profissionalID );
                
                redis.get( chave, (erro, result ) => {
                    if( !erro && result ) return resolve( JSON.parse( result ) );
                    
                    // não encontrou no redis, busca no DB
                    mysql.query(`SELECT id, token, refresh_token, timeZone, agenda_id, DATE_FORMAT(expiry, '%Y-%m-%d %H:%i:%s') AS expiry FROM google_agenda WHERE empresa_id = ? AND profissional_id = ? AND ativo = 's' ORDER BY id DESC LIMIT 1`, [ empresaID, profissionalID ], (err, result) => {
                        if(err || !result) return reject("erro interno");
                        if( result.length === 0 ) return reject( );
                        resolve( result[0] );
                        this.agendaGoogleConfigurada( empresaID, profissionalID, result[0] );
                    });
                });
            });
        }


        /**
         * Revoga uma autorização, antes checa se o token não foi expirado, se necessário renova o
         * Também apaga a agenda que foi criada no google Calendar
         * @param {String} token token de acesso
         * @param {String} refreshToken token de atualização do token de acesso, quando o mesmo expira
         * @param {String} agendaID id da agenda no google calendar
         */
        revogaAutorizacao( token, refreshToken, agendaID ) {
            return new Promise( ( resolve, reject ) => {
                
                if( !token ) return reject('token faltando');
                if( !agendaID ) return reject('ID da agenda do google faltando');

                let erroInfo;
                async.series({
                    tokenInfo: ( callback ) => {
                        GCalendar.getTokenInfo( token )
                        .then( info => { callback(); })
                        .catch( erro => { erroInfo = erro; callback(); });
                    },

                    renovaToken: ( callback ) => {
                        if( erroInfo && !['invalid_token', 'invalid_grant'].includes( erroInfo.error || '' ) ) return callback( erroInfo );// se o erro não for contornável
                        if ( !erroInfo ) return callback(); // não precisa renovar o token
                        if( !refreshToken ) return reject('refreshToken faltando');

                        GCalendar.renovaToken( refreshToken )
                        .then( _token => {
                            token = _token.access_token;
                            callback();
                        })
                        .catch( erro => {
                            callback( erro );
                        });
                    },

                    removeAgenda: ( callback ) => {
                        GCalendar.removeAgenda( token, agendaID )
                        .then( successo => { callback(); })
                        .catch( erro => { callback(); });// não remover a agenda não é problema, a renovagação deve acontecer mesmo assim, pois o usuário pode ter removido a agenda manualmente
                    },

                    revogaToken: ( callback ) => {
                        GCalendar.revogaToken( token )
                        .then( successo => { callback(); })
                        .catch( erro => { callback( erro ); });
                    }
                }, (erro, result) => {
                    if( erro ) return reject( erro );
                    resolve( result );
                });
            });            
        }



        ////////////////// REDIS ///////////////

        /**
         * Registra no cache redis os dados de conexão com o google agenda
         * 
         * @param {Integer} empresaID PK da empresa
         * @param {Integer} profissionalID PK do profissional
         * @param {Object} token token da forma que foi gravado no banco de dados, tablea 'google_agenda'
         */
        agendaGoogleConfigurada( empresaID, profissionalID, token ) {
            let chave = this._getChaveRedis( empresaID, profissionalID );

            redis.set( chave, JSON.stringify( token ) );
            if( this.tempoSessaoRedis ) { redis.expire( chave, this.tempoSessaoRedis); }

            // TODO: determinar o tempo de expiração automaticamente baseado no tempo de expiração do token
        }

        agendaGoogleRemovida( empresaID, profissionalID ) {
            let chave = this._getChaveRedis( empresaID, profissionalID );
            redis.del( chave );
        }
        
        _getChaveRedis( empresaID, profissionalID ) {
            let chave = this.chaveRedis.replace('{empresaID}', empresaID);
            return ( chave.replace('{profissionalID}', profissionalID) );
        }
        //////////////// fim REDIS ////////////
    }

    module.exports = new AgendaUtil();
}