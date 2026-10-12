/* jshint -W030 */

/**
 * Está classe irá trablhar com o Google Calendar
 * Irá inserir e atualizar os agendamentos na agenda do google
 * de cada médico
 */

 // DOC: https://developers.google.com/calendar/create-events
{
    "use strict";

    const {google} = require('googleapis'),
    calendar = google.calendar('v3');
    conf = require('src/util/config'),
    _ = require('underscore');

    class GoogleCalenario {
        constructor () {
            this.oauth2Client = new google.auth.OAuth2(
                conf.googleAgenda.clientID,
                conf.googleAgenda.clientSecret,//YOUR_CLIENT_SECRET
                conf.googleAgenda.redirectUrl,//YOUR_REDIRECT_URL
            );
        }

        // métodos de autorização

        /**
         * Etapa 1/2 da autorização
         * @param {string} tipoAcesso passar offline quando for para atualizar o token de acesso
         */
        getUrlAutorizacao ( tipoAcesso ) {
            if( !['offline', 'online'].includes( tipoAcesso )) tipoAcesso = 'online';

            tipoAcesso = 'offline'; // parece que tem que ser sempre 'offline'
            const url = this.oauth2Client.generateAuthUrl({
                access_type: tipoAcesso,// online (default) our offline
                scope: ['https://www.googleapis.com/auth/calendar']
            });
            return url;
        }

        /**
         * Etapa 2/2 da autorização
         * Nesse momento o google retornou o usuário para a URL de retorno com o parametro ?code={authorizationCode}
         * Depois temos que usar esse código para pegar o token que será utilizado nas chamadas a API
         * 
         * @param {*} codigoRetorno 
         */
        getTokenDeAcesso( codigoRetorno ) {
            return new Promise( (resolve, reject ) => {
                this.oauth2Client.getToken( codigoRetorno ).then( token => {
                    // this.oauth2Client.setCredentials( token );// seria usado em outro contexto, mas nesse não é necessário
                    // this.monitoraToken();
                    resolve( token.tokens );
                }).catch( erro => {
                    reject( erro );
                });
            });
        }

        // Não será usado
        // monitoraToken() {
        //     this.oauth2Client.on('tokens', (tokens) => {
        //         if (tokens.refresh_token) {
        //           // armazenar refresh_token no banco de dados
        //         }
        //       });
        // }

        // métodos da agenda

        /**
         * Cria um evento
         * @param {String} accessToken token de acesso
         * @param {String} agendaID Identificador da agenda no google
         * @param {Object} agenda JSON no padrão do google
         */
        criaEvento( accessToken, agendaID, agenda ) {
            return new Promise( ( resolve, reject ) => {
                calendar.events.insert({
                    oauth_token: accessToken,
                    calendarId: agendaID,
                    resource: agenda
                }).then( evento => {
                    resolve( evento.data || evento );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Atualiza parte dos dados de um evento. Só altera os dados enviados,
         * os demais ficam como estavam
         * 
         * @param {String} accessToken token de acesso
         * @param {String} agendaID PK da agenda
         * @param {String} eventoID PK do evento
         */
        atualizaParcialEvento( accessToken, agendaID, eventoID, agendaDados ) {
            return new Promise( ( resolve, reject ) => {
                calendar.events.patch({
                    oauth_token: accessToken,
                    calendarId: agendaID,
                    eventId: eventoID,
                    requestBody: agendaDados
                }).then( value => {
                    resolve( value.data );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Cria uma agenda no google calenar. O nome do profissional será o nome da agenda
         */
        criaAgenda( accessToken, timeZone, profissionalNome, agendaID ) {
            return new Promise( ( resolve, reject ) => {
                let dados = {
                    // id: agendaID,// o google recusa quase todos os IDs, mesmo se usar apenas letras minusculas e números entre 5 e 1024 caracteres
                    summary: `99Clinic - ${profissionalNome}`,
                    timeZone: timeZone || 'America/Sao_Paulo',
                    description: 'Agenda criada pelo sistema 99Clinic.com. Essa agenda será sincronizada automaticamente com sua agenda 99Clinic.'
                    // backgroundColor: '#00bbb4',
                    // foregroundColor: '#FFFFFF'
                };
                if( agendaID ) dados.id = agendaID;

                calendar.calendars.insert({
                    oauth_token: accessToken,
                    requestBody: dados
                })
                .then( agenda => {
                    resolve( agenda.data );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                })
            })
        }

        /**
         * Remove uma agenda no google calendar
         * @param {String} accessToken o token de acesso
         * @param {String} agendaID o ID da agenda no google calendar
         */
        removeAgenda( accessToken, agendaID ) {
            return new Promise( ( resolve, reject ) => {
                if( agendaID === 'primary' ) return reject('Não pode ser removida a agenda principal do usuário');
                calendar.calendars.delete({
                    oauth_token: accessToken,
                    calendarId: agendaID
                })
                .then( result => {
                    resolve( );
                })
                .catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Lista de eventos de uma agenda
         * NÃO ESTÁ SENDO USADO
         */
        listaEventosDaAgenda( accessToken, agendaID ) {
            return new Promise( ( resolve, reject ) => {
                calendar.events.list({
                    oauth_token: accessToken,
                    calendarId: agendaID
                }).then( value => {
                    resolve(value.data);
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        // Não está sendo usado
        listaAgendas( accessToken ) {
            return new Promise( ( resolve, reject ) => {
                calendar.calendarList.list({
                    oauth_token: accessToken
                }).then( value => {
                    resolve(value.data);
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Retorna um evento específico, usado para saber se pode atualizar o evento
         * @param {String} accessToken token de acesso
         * @param {String} agendaID PK da agenda
         * @param {String} eventoID PK do evento
         */
        getEvento( accessToken, agendaID, eventoID ) {
            return new Promise( ( resolve, reject ) => {
                calendar.events.get({
                    oauth_token: accessToken,
                    calendarId: agendaID,
                    eventId: eventoID
                })
                .then( value => {
                    resolve( value.data );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Pega uma agenda através do ID, está sendo usado para pegar o timeZone
         * @param {String} accessToken 
         * @param {String} agendaID pra pegar o calendario principal passar 'primary'
         */
        getCalendario( accessToken, agendaID ) {
            return new Promise( ( resolve, reject ) => {
                calendar.calendars.get({
                    oauth_token: accessToken,
                    calendarId: agendaID
                })
                .then( value => {
                    resolve( value.data );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Revoga o token de acesso. Depois de realizar esse procedimento
         * não será mais possível utilizar o token de acesso para fazer chamadas
         * de API
         * 
         * @param {String} token token de acesso
         */
        revogaToken( token ) {
            return new Promise( ( resolve, reject ) => {
                this.oauth2Client.revokeToken( token )
                .then( sucesso => {
                    resolve( sucesso );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }


        /**
         * Renova a validade do token de acesso
         * @param {String} refreshToken token usado para atualizar a validade do token de acesso
         */
        renovaToken( refreshToken ) {
            return new Promise( (resolve, reject) => {
                this.oauth2Client.refreshToken( refreshToken ).then( headers => {
                    resolve( headers.tokens );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }

        /**
         * Retorna informações sobre o token de acesso
         * Com esse método é possível saber se o token ainda estiver válido
         * (dentro da validade e não tiver sido revogado)
         * 
         * @param {String} accessToken token de acesso
         */
        getTokenInfo( accessToken ) {
            return new Promise( (resolve, reject) => {
                this.oauth2Client.getTokenInfo( accessToken ).then( info => {
                    resolve( info );
                }).catch( erro => {
                    reject( erro.response.data || erro.response || erro );
                });
            });
        }
    }

    module.exports = new GoogleCalenario();
}
