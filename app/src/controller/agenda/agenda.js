;(function () {
    "use strict";
    

    const Promise = require("promise"),
        mysql = require('src/util/conexoes.js'),
        async = require('async'),
        validar = require('./agenda-validacao'),
        moment = require('moment'),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos'),
        log = require('src/util/logInterno'),
        storage = require('src/lib/storage/googleStorage'),
        agendaUtil = require('src/controller/agenda/agenda-util');
    
    let instance = null;
    const prefixoEvento = 'agenda.';
    
    //moment.locale('pt-BR'); // agora esta em inglês

    function Agenda() {
        const self = this;

        self.getHorariosLivres = getHorariosLivres;
        self.getHorariosData = getHorariosData;
        self.agendar = agendar;
        self.getAtendimentosDia = getAtendimentosDia;
        self.getAtendimentoDia = getAtendimentoDia;
        self.ordenarAgendaDia = ordenarAgendaDia;
        self.mudaStatusAtendimento = mudaStatusAtendimento;
        self.iniciaAtendimento = iniciaAtendimento;
        self.cancelaAtendimentoEmCurso = cancelaAtendimentoEmCurso;
        self.concluiAtendimento = concluiAtendimento;
        self.informaPagamento = informaPagamento;
        self.editAtendimento = editAtendimento;
        self.totalAtendimentos = totalAtendimentos;
        self.getAtendimentos = getAtendimentos;
        self.getAtendimento = getAtendimento;
        self.ultimosAtendimentos = ultimosAtendimentos;
        self.mudaPreferenciaProfissional = mudaPreferenciaProfissional;

        
        /*
         * Retorna os horários livres para um médico, de segunda a domingo
         * Na verdade, retorna para 7 dias. Para retornar de segunda a domingo, 
         * a dataInicial deve ser de uma segunda-feira
         */
        function getHorariosLivres(empresaID, servicoID, medicoID, dataInicial) {
            return new Promise( function ( resolve, reject){
                let data = moment(dataInicial, 'YYYY-MM-DD');
                if(!data.isValid()) return reject('Data inválida');

                // retorna nome do dia da semana em português
                const getDiaSemana = function(diaSemanaIngles) {
                    let diaSemanaPt = '';
                    switch(diaSemanaIngles.toLowerCase()) {
                        case 'mon': diaSemanaPt = 'seg'; break;
                        case 'tue': diaSemanaPt = 'ter'; break;
                        case 'wed': diaSemanaPt = 'qua'; break;
                        case 'thu': diaSemanaPt = 'qui'; break;
                        case 'fri': diaSemanaPt = 'sex'; break;
                        case 'sat': diaSemanaPt = 'sáb'; break;
                        case 'sun': diaSemanaPt = 'dom'; break;
                        default: diaSemanaPt = diaSemanaIngles;
                    }
                    return diaSemanaPt;
                };
                
                const call = function(_data, callback) {
                    mysql.query("CALL p_horario_livre_srv(?,?,?,?)", [empresaID, servicoID, medicoID, _data.format("YYYY-MM-DD")], function(err, result){
                        if(err) return callback('Erro interno ao consultar agenda');
                        if(result.msg) return callback(result.msg, null);
                        callback(null, {
                            i: result[0],
                            data: _data.format("YYYY-MM-DD"),
                            datastr: _data.format("DD/MM"),
                            nome: getDiaSemana(_data.format("ddd")),
                            //eHoje: _data.isSame(new Date(), "day") agora é o APP angular que determina, de acordo com a data do PC do cliente
                        });
                    });
                };

                let _tue = data.clone().add(1, "d");
                let _wed = data.clone().add(2, "d");
                let _thu = data.clone().add(3, "d");
                let _fri = data.clone().add(4, "d");
                let _sat = data.clone().add(5, "d");
                let _sun = data.clone().add(6, "d");
                
                //parallel series
                async.parallel({
                    mon: function(callback) {call(data, callback);},// segunda
                    tue: function(callback) {call(_tue, callback);},// terça
                    wed: function(callback) {call(_wed, callback);},// quarta
                    thu: function(callback) {call(_thu, callback);},// quinta
                    fri: function(callback) {call(_fri, callback);},// sexta
                    sat: function(callback) {call(_sat, callback);},// sábado
                    sun: function(callback) {call(_sun, callback);} // domingo
                 }, function(err, result){
                     if(err) return reject(err);
                     // retorna na ordem desejada, já que result retorna em ordem aleatória por ser parallel (mais rápido)
                     return resolve({
                        mon: result.mon,
                        tue: result.tue,
                        wed: result.wed,
                        thu: result.thu,
                        fri: result.fri,
                        sat: result.sat,
                        sun: result.sun
                     });
                 });
                
            });
        }//getHorariosLivres
        
        
        /*
         * Retorna os horários para um médico de uma data específica
         * Leva em consideração o serviço
         */
        function getHorariosData(empresaID, servicoID, medicoID, data) {
            return new Promise( function ( resolve, reject){
                let _data = moment(data, 'YYYY-MM-DD');
                if(!_data.isValid()) return reject('Data inválida');

                mysql.query("CALL p_horario_livre_srv(?,?,?,?)", [empresaID, servicoID, medicoID, data], function(err, result){
                    if(err || !result) return reject('Erro interno ao consultar agenda');
                    if(result.msg) return reject(result.msg);
                    resolve(result[0]);
                });
            });
        }//getHorariosData
        
        
        function agendar(empresaID, userID, agenda) {
            return new Promise( function ( resolve, reject){
                let atendimentoID;
                let srv;
                let comissao;
                let conexao;
                let dataStatus;
                const Transaction = function(callback) {
                    let pool = mysql.pool;
                    pool.getConnection(function (err, connection) {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction(function(err) {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                const Atendimento = function(callback){
                    dataStatus = new Date();
                    let insert = {
                        empresa_id: empresaID,
                        cliente_id: agenda.clienteID,
                        servico_id: agenda.servicoID,
                        profissional_id: agenda.medicoID,
                        procedimento: srv.nome,
                        valor: srv.valor,
                        comissao: comissao,
                        dt_agenda: agenda.data,
                        status: agenda.status,
                        status_data: dataStatus
                    };
                    if(agenda.preferencia_prof) insert.preferencia_prof = agenda.preferencia_prof;
                    if(agenda.convenioID)   insert.convenio_id = agenda.convenioID;
                    if(agenda.convenio_cod) insert.convenio_cod = agenda.convenio_cod;
                    if(agenda.obs)          insert.obs = agenda.obs;
                    
                    if(agenda.pg_valor)     insert.pg_valor = agenda.pg_valor;
                    if(agenda.pg_dt)        insert.pg_dt = agenda.pg_dt;
                    if(agenda.pg_forma)     insert.pg_forma = agenda.pg_forma;
                    if(agenda.pg_dt_cheque) insert.pg_dt_cheque = agenda.pg_dt_cheque;
                    if(agenda.pg_parcelas)  insert.pg_parcelas = agenda.pg_parcelas;
                    if(agenda.pg_obs)       insert.pg_obs = agenda.pg_obs;
                    if(agenda.acrescimo)    insert.acrescimo = agenda.acrescimo;
                    if(agenda.demo)         insert.demo = agenda.demo;
                    
                    // se for um RETORNO
                    if(agenda.atendimentoID)  {
                        insert.valor = 0;
                        insert.comissao = 0;
                        insert.atendimento_id = agenda.atendimentoID;
                    }
                    
                    conexao.query('INSERT INTO atendimento SET ?', [insert], function(err, result){
                        if(err || result.length == 0) return callback('Erro interno ao registra atendimento');
                        atendimentoID = result.insertId;
                        callback(err);
                    });
                };

                const Status = function(callback){
                    let insert = {atendimento_id: atendimentoID, usuario_id: userID, status: agenda.status, data: dataStatus};
                    conexao.query('INSERT INTO atendimento_status SET ?', [insert], function(err, result){
                        if(err || result.length == 0) return callback('Erro interno ao registra status', null);
                        callback();
                    });
                };

                const EnviaParaGoogleCalenar = () => {
                    if( agenda.demo ) return;
                    let _agenda = Object.assign( {id: atendimentoID, servicoNome: srv.nome, servicoTempo: srv.tempo}, agenda );
                    agendaUtil.criaAgendamentoNoGoogleCalendar( empresaID, agenda.medicoID, userID, _agenda );
                }
                
                const processa = function() {
                    async.series([Transaction, Atendimento, Status],
                    function(err){
                        if(err) {
                            reject(err);
                            conexao.rollback(function(){conexao.release();});
                        }else{
                            conexao.commit(function(err) {
                                if(err) {
                                    reject('Erro interno');
                                    conexao.rollback(function(){conexao.release();});
                                }else {
                                    conexao.release();
                                    resolve(atendimentoID);
                                    evento.emit( `${prefixoEvento}novo`, empresaID, agenda.data, atendimentoID, agenda.medicoID, agenda.clienteID, agenda.servicoID );
                                    EnviaParaGoogleCalenar();
                                }
                            });
                        }
                    });
                };
                
                validar.valida(empresaID, agenda).then(function(_ret){
                    srv = _ret.srv;
                    comissao = _ret.comissao;
                    agenda = _ret.agenda;
                    processa();
                }).catch(function(err){
                    reject(err);
                });
                
            });
        }//Agendar

        
        function editAtendimento(user, atendimentoID, dados) {
            return new Promise( function ( resolve, reject){
                let value;
                let conexao;
                let dataStatus = new Date();
                const Transaction = (callback) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection) => {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction((err) => {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };
                
                const Atendimento = (callback) => {
                    let update = {
                        obs: value.obs || null,
                        preferencia_prof: value.preferencia_prof || null,
                        convenio_id: value.convenioID || null,
                        convenio_cod: value.convenio_cod || null,
                        dt_agenda: value.data
                    };

                    // se houver mudança de status
                    if(value.status != value.status_atual)  {
                        update.status = value.status;
                        update.status_data = dataStatus;
                    }
                    
                    conexao.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [update, atendimentoID, user.empresa_id], (err) =>{
                        if(err) return callback('Erro interno');
                        callback();
                    });
                };
                
                const Status = (callback) => {
                    if(value.status == value.status_atual)  return callback();
                    const insert = {atendimento_id: atendimentoID, usuario_id: user.id, status: value.status, data: dataStatus};
                    conexao.query('INSERT INTO atendimento_status SET ?', [insert], (err, result) =>{
                        if(err || result.length == 0) return callback('Erro interno ao registra status', null);
                        callback();
                    });
                };

                /**
                 * Depois da alteração feita, pega os dados do agendamento e sincroniza com o google
                 */
                const SincronizaComAgendaGoogle = () => {
                    if( value.demo == 's' ) return;
                    
                    mysql.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.dt_agenda AS data, s.tempo AS servicoTempo, 
                        IFNULL(c.nome, 'Particular') AS convenio 
                        FROM atendimento a
                        LEFT JOIN convenio c ON (c.id = a.convenio_id)
                        LEFT JOIN servico s ON (s.id = a.servico_id)
                        WHERE a.id = ? AND a.empresa_id = ? LIMIT 1`, 
                    [ atendimentoID, user.empresa_id], (err, atm) => {
                        if( err || !atm ) return;
                        if( atm.length === 0 ) return;

                        agendaUtil.atualizaAgendamentoNoGoogleCalendar( user.empresa_id, atm[0].profissional_id, user.id, atm[0] );
                    });
                }
                
                validar.validaAtualizacao(user.empresa_id, user, atendimentoID, dados).then( (_value) => {
                    value = _value;
                    async.series([Transaction, Atendimento, Status],
                    (err) => {
                        if(err) {
                            conexao.rollback(() =>{conexao.release();});
                            return reject(err);
                        }
                        conexao.commit( (err) => {
                            if(err) {
                                conexao.rollback(() => conexao.release() );
                                return reject('Erro interno');
                            }

                            conexao.release();
                            resolve();
                            evento.emit( `${prefixoEvento}edit`, user.empresa_id, atendimentoID, dados );

                            SincronizaComAgendaGoogle();
                        });
                    });
                }).catch( (err) => {
                    reject(err);
                });
            });
        } // editAtendimento

        /**
         * O select completo que será usado na busca por atendimento do dia
         * Usado pelas funções "getAtendimentosDia" e "getAtendimentoDia"
         * 
         * @param {String} where condição de busca do atendimento do dia
         */
        function getSelectAtendimentoDia( where ) {
            return (`SELECT DISTINCT a.servico_id AS sID, a.procedimento, p.id AS pID, p.nome, u.foto, p.especialidade, s.tempo, a.demo
            FROM atendimento a 
            LEFT JOIN profissional p ON (p.id = a.profissional_id) 
            LEFT JOIN usuario u ON (p.usuario_id = u.id) 
            LEFT JOIN servico s ON (s.id = a.servico_id) 
            WHERE ${where} GROUP BY p.id ORDER BY p.nome ASC`);
        }

        /**
         * Segundo select do "atendimento do dia", usado pelas funções 
         * "getAtendimentosDia" e "getAtendimentoDia"
         */
        const selectB = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
            DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i") AS dt_status,
            a.procedimento, a.convenio_cod, 
            a.preferencia_prof, a.ordem, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin,  
            IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
            c.nome AS cliente_nome, c.img, cv.nome AS convenio_nome, cv.id AS cvID, p.nome AS profissional_nome 
            FROM v_atendimento a 
            LEFT JOIN profissional p ON (p.id = a.profissional_id) 
            LEFT JOIN cliente c ON (c.id = a.cliente_id)
            LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
            WHERE a.empresa_id = ? AND a.profissional_id = ? AND DATE(a.dt_agenda) = ?
            ORDER BY 
                a.status = 4 DESC, 
                a.status = 8 DESC, 
                a.status = 3 DESC, 
                a.status = 1 DESC, 
                a.status = 2 DESC, 
                a.status = 5 DESC, 
                a.status = 7 DESC, 
                a.status = 6 DESC,
                a.dt_status`;
        
        /**
         * Retorna todos os profissionais que tem serviços agendados para o dia corrente
         * e seus respectivos clientes
         * @param {string} data data corrente (hoje) no formato YYYY-MM-DD informado pelo navegador do usuário
         */
        function getAtendimentosDia(empresaID, data, user ) {
            return new Promise( ( resolve, reject ) => {
                let where = 'a.empresa_id = ? AND DATE(a.dt_agenda) = ?';
                let cols = [empresaID, data];
                
                // se profissional, retorna apenas a si mesmo
                if(user.perfil === 'p') {
                    where += ' AND a.profissional_id = ?';
                    cols.push( user.profissional_id );
                }

                let selectA = getSelectAtendimentoDia( where );
                let retorno = [];
                mysql.query(selectA, cols, (err, result) => {
                    if( err || !result ) return reject('Não foi possível buscar agendas do dia');
                    if( result.length < 1 ) return resolve( retorno );
                    retorno = result;
                    async.each(result, (p, callback) => {
                        mysql.query(selectB, [empresaID, p.pID, data], (err, resul) =>{
                            if(err || !resul ) {
                                p.pacientes = [];
                            } else {
                                p.pacientes = resul;
                            }
                            callback();
                        });
                    }, ( erro ) => {
                        if( erro ) return reject( erro );
                        resolve( retorno );
                    });
                });
            });
        } // getAtendimentosDia
        
        /*
         * Retorna uma agenda do dia, apenas uma. Essa é a diferença para a 
         * função getAtendimentosDia
         */
        function getAtendimentoDia(empresaID, user, atendimentoID, profissionalID, data) {
            return new Promise( ( resolve ) => {
                let where = 'a.empresa_id = ? AND a.id = ? AND p.id = ?';
                let cols = [empresaID, atendimentoID, profissionalID];
                // se profissional, retorna apenas a si mesmo
                if(user.perfil === 'p') {
                    where += ' AND a.profissional_id = ?';
                    cols.push( user.profissional_id );
                }
                let selectA = getSelectAtendimentoDia( where );
                selectA += ' LIMIT 1';
                    
                mysql.query(selectA, cols, (err, p) => {
                    if(err || !p || p.length == 0) return resolve();
                    p = p[0];
                    mysql.query(selectB, [empresaID, p.pID, data], (err, result) => {
                        if(err || !result ) {
                            p.pacientes = [];
                        } else {
                            p.pacientes = result;
                        }
                        resolve(p);
                    });
                });
            });
        } //getAtendimentoDia
        
        function ordenarAgendaDia(empresaID, profissionalID, ordens) {
            let pool = mysql.pool;
            pool.getConnection(function (err, connection) {
                connection.beginTransaction(function(err) {
                    if (err) { mysql.rollback(function(){connection.release();}); return;}

                    async.each(ordens, function(item, callback){
                        connection.query('UPDATE atendimento SET ordem = ? WHERE id = ? AND empresa_id = ?', [item.ordem, item.id, empresaID], function(err, result){
                            callback();
                        });
                    }, function(err){
                        if(err) connection.rollback(function(){connection.release();});
                        else {
                            connection.commit(function() {connection.release();});
                            evento.emit( `${prefixoEvento}ordenarAgendaDia`, empresaID, profissionalID, ordens );
                        }
                    });
                });
            });
        } // ordenarAgendaDia
        
        /**
         * Muda o status de um atendimento.
         * REGRAS:
         * - só o profissional pode alterar o status para 'EM ATENDIMENTO', status 4 | OK
         * - só o profissional pode alterar o status para 'ATENDIDO', status 5 | OK
         * - quando o status atual for 4 (EM ATENDIMETO), só pode ser alterado para 5 (ATENDIDO) OU para o anterior (alterado através de 'cancelarAtendimento') | OK
         * - não pode alterar o status quando o mesmo estiver sido 'ATENDIDO', status 5 | OK
         */
        function mudaStatusAtendimento(empresaID, user, atendimentoID, status, obs) {
            return new Promise( ( resolve, reject) =>{

                // checagem inicial
                if( !_.isString( status )) return reject('Status inválido');
                if( !['1','2','3','4','5','6','7', '8'].includes( status ) ) return reject('Status inválido');

                if( ( status == '4' || status == '5' ) && user.perfil != 'p' ) return reject('Somente profissionais podem realizar um atendimento');
                let atm;
                async.series([
                    // checa o atendimento
                    (callback) => {
                        mysql.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.demo, 
                            IFNULL(c.nome, 'Particular') AS convenio 
                            FROM atendimento a
                            LEFT JOIN convenio c ON (c.id = a.convenio_id)
                            WHERE a.id = ? AND a.empresa_id = ? LIMIT 1`
                        , [atendimentoID, empresaID], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            if( result.length === 0 ) return callback('Esse atendimento parece não existir');
                            if( result[0].status == 5 ) return callback('Atendimento concluído não pode ser alterado');
                            // quando esta "EM ATENDIMENTO", só o profissional pode alterar o status, porém na sua área de atendimento (não por meio dessa função)
                            if( result[0].status == 4 ) return callback('Atendimento em andamento, usar a opção CONCLUIR');// substitui a linha abaixo

                            if( ( status == '4' || status == '5' ) && user.profissional_id != result[0].profissional_id ) {
                                return callback('Esse atendimento pertence a outro profissional');
                            }

                            if( status == '4' || status == '5' ) return callback('Alteração disponível somente na área de atendimento');
                            atm = result[0];

                            callback();
                        });
                    },
                    // checa a conta do usuário
                    (callback) => {
                        mysql.query('SELECT ativo FROM usuario WHERE id = ? AND empresa_id = ? LIMIT 1', [user.id, empresaID], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            if( result.length === 0 ) return callback('Problema com sua conta');
                            if( result[0].ativo != 's' ) return callback('Sua conta não esta ativa');
                            callback();
                        });
                    },
                    // altera o status
                    (callback) => {
                        const insert = {
                            atendimento_id: atendimentoID,
                            usuario_id: user.id,
                            status: status,
                            data: new Date(),
                            obs: obs
                        };
                        mysql.query('INSERT INTO atendimento_status SET ?', [insert], (err, result) => {
                            if( err || !result ) return callback('erro interno');
                            callback();

                            // atualiza a tabela 'atendimento', com o status e hora da mudança
                            let update = {status: status, status_data: insert.data};

                            // atualiza a hora que o atendimento foi iniciado
                            if( status == '4' ) update.dt_servico = insert.data;
                            // atualiza a hora que o atendimento foi finalizado
                            if( status == '5' ) update.dt_fim_atendimento = insert.data;

                            mysql.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [update, atendimentoID, empresaID]);
                        });
                    }
                ], 
                (err) => {
                    if( err ) return reject(err);
                    
                    resolve();
                    evento.emit( `${prefixoEvento}mudaStatusAtendimento`, empresaID, atendimentoID, status );

                    // envia os dados para a agenda do google
                    if( atm.demo != 's' ) {
                        atm.status = status;
                        agendaUtil.atualizaAgendamentoNoGoogleCalendar( empresaID, atm.profissional_id, user.id, atm );
                    }
                });
            });// promise
        }//mudaStatusAtendimento

        /**
         * Inicia um atendimento, ou seja, altera o status para "EM ATENDIMENTO" (4)
         * 
         * REGRAS
         * - somente o profissional dono do atendimento pode realizar a alteração
         * - o status atual não pode ser "EM ATENDIMENTO" (4) nem "ATENDIDO" (5)
         * 
         * @param {int} user usuário que esta realizando a alteração
         * @param {int} atendimentoID PK do atendimento que esta sendo concluído
         */
        function iniciaAtendimento( user, atendimentoID ) {
            return new Promise( ( resolve, reject) =>{
                if( user.perfil != 'p' ) return reject('Somente profissionais podem iniciar um atendimento');
                let novoStatus = '4', conexao, dataStatus = new Date(), atm;

                async.series([
                    // transaction
                    (callback) => {
                        let pool = mysql.pool;
                        pool.getConnection( (err, connection) => {
                            if (err) return callback('erro interno');
                            conexao = connection;
                            conexao.beginTransaction((err) => {
                                if (err) { return callback('erro interno', null);}
                                callback();
                            });
                        });
                    },

                    // checa o atendimento
                    (callback) => {
                        conexao.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.demo, 
                            IFNULL(c.nome, 'Particular') AS convenio
                            FROM atendimento a
                            LEFT JOIN convenio c ON (c.id = a.convenio_id)
                            WHERE a.id = ? AND a.empresa_id = ? LIMIT 1`, 
                        [atendimentoID, user.empresa_id], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            if( result.length === 0 ) return callback('Esse atendimento parece não existir');
                            let statusAtual= result[0].status;
                            if( statusAtual == 4 ) return callback('Esse atendimento já esta "em andamento"');
                            if( statusAtual == 5 ) return callback('Atendimento concluído não pode ser iniciado novamente');

                            if( user.profissional_id != result[0].profissional_id ) {
                                return callback('Esse atendimento pertence a outro profissional');
                            }
                            atm = result[0];
                            callback();
                        });
                    },
       
                    // altera o status
                    (callback) => {
                        const insert = {
                            atendimento_id: atendimentoID,
                            usuario_id: user.id,
                            status: novoStatus,
                            data: dataStatus
                        };
                        conexao.query('INSERT INTO atendimento_status SET ?', [insert], (err, result) => {
                            if( err || !result ) return callback('erro interno');
                            callback();
                        });
                    },
                    // atualiza atendimento
                    (callback) => {
                        let update = {status: novoStatus, status_data: dataStatus, dt_servico: dataStatus};

                        conexao.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [update, atendimentoID, user.empresa_id], (err, result) => {
                            if( err || !result ) return callback('erro interno');
                            callback();
                        });
                    }
                ], 
                (err) => {
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    
                    conexao.commit((err)=> {
                        if(err) {
                            conexao.rollback(()=> conexao.release() );
                            return reject('Erro interno no commit');
                        }
                        conexao.release();
                        resolve( );
                        evento.emit( `${prefixoEvento}mudaStatusAtendimento`, user.empresa_id, atendimentoID, novoStatus );

                        if( atm.demo != 's' ) {
                            atm.status = novoStatus;
                            agendaUtil.atualizaAgendamentoNoGoogleCalendar( user.empresa_id, atm.profissional_id, user.id, atm );
                        }
                    });
                });
            });// promise
        }

        /**
         * Conclui um atendimento, ou seja, altera o status de "EM ATENDIMENTO"
         * para "ATENDIDO"
         * 
         * REGRAS
         * - somente o profissional dono do atendimento pode realizar a alteração
         * - o status atual do atendimento deve ser "EM ATENDIMENTO"
         * 
         * @param {int} user usuário que esta realizando a alteração
         * @param {int} atendimentoID PK do atendimento que esta sendo concluído
         */
        function concluiAtendimento( user, atendimentoID ) {
            return new Promise( ( resolve, reject) =>{
                if( user.perfil != 'p' ) return reject('Somente profissionais podem concluir um atendimento');
                let novoStatus = '5', conexao, dataStatus = new Date(), atm; // atendido

                async.series([
                    // transaction
                    (callback) => {
                        let pool = mysql.pool;
                        pool.getConnection( (err, connection) => {
                            if (err) return callback('erro interno');
                            conexao = connection;
                            conexao.beginTransaction((err) => {
                                if (err) { return callback('erro interno', null);}
                                callback();
                            });
                        });
                    },

                    // checa o atendimento
                    (callback) => {
                        conexao.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.demo,
                            IFNULL(c.nome, 'Particular') AS convenio
                            FROM atendimento a
                            LEFT JOIN convenio c ON (c.id = a.convenio_id)
                            WHERE a.id = ? AND a.empresa_id = ? LIMIT 1`, 
                        [atendimentoID, user.empresa_id], (err, result) => {
                            if( err || !result ) return callback('Erro interno');
                            if( result.length === 0 ) return callback('Esse atendimento parece não existir');
                            if( result[0].status != 4 ) return callback('Apenas atendimento com o status "em atendimento" pode ser concluído!');

                            if( user.profissional_id != result[0].profissional_id ) {
                                return callback('Esse atendimento pertence a outro profissional');
                            }

                            atm = result[0];
                            callback();
                        });
                    },
       
                    // altera o status
                    (callback) => {
                        const insert = {
                            atendimento_id: atendimentoID,
                            usuario_id: user.id,
                            status: novoStatus,
                            data: dataStatus
                        };
                        conexao.query('INSERT INTO atendimento_status SET ?', [insert], (err, result) => {
                            if( err || !result ) return callback('erro interno');
                            callback();
                        });
                    },
                    // atualiza atendimento
                    (callback) => {
                        let update = {status: novoStatus, status_data: dataStatus, dt_fim_atendimento: dataStatus};

                        conexao.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [update, atendimentoID, user.empresa_id], (err, result) => {
                            if( err || !result ) return callback('erro interno');
                            callback();
                        });
                    }
                ], 
                (err) => {
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    
                    conexao.commit((err)=> {
                        if(err) {
                            conexao.rollback(()=> conexao.release() );
                            return reject('Erro interno no commit');
                        }
                        conexao.release();
                        resolve( );
                        evento.emit( `${prefixoEvento}mudaStatusAtendimento`, user.empresa_id, atendimentoID, novoStatus );

                        // envia os dados para a agenda do google
                        if( atm.demo != 's' ) {
                            atm.status = novoStatus;
                            agendaUtil.atualizaAgendamentoNoGoogleCalendar( user.empresa_id, atm.profissional_id, user.id, atm );
                        }
                    });
                });
            });// promise
        }

        /**
         * Cancela um atendimento, ou seja, altera o status de "EM ATENDIMENTO" (5)
         * para o status imediatamente anterior, na prática é muito semelhante a
         * função 'mudaStatusAtendimento', a não ser pela necessidade de descobrir
         * o status anterior e pela exclusão do prontuário associado ao atendimento
         * (pode ser preservado se o profissional desejar)
         * 
         * REGRAS
         * - só o profissional do atendimento pode fazer isso
         * - apenas se o status atual for 4 (EM ATENDIMENTO)
         * - o novo status não pode ser 4 ou 5 (EM ATENDIMENTO ou ATENDIDO)
         */
        function cancelaAtendimentoEmCurso( empresaID, user, atendimentoID, obs, preservarProntuario ) {
            return new Promise( ( resolve, reject) => {
                if( user.perfil != 'p' ) return reject('Você não tem permissão para cancelar atendimento');

                let novoStatus, conexao, anexoNaoRemovidos = [], atm;
                async.series([
                    // transaction
                    (callback) => {
                        let pool = mysql.pool;
                        pool.getConnection( (err, connection) => {
                            if (err) return callback('erro interno');
                            conexao = connection;
                            conexao.beginTransaction((err) => {
                                if (err) { return callback('erro interno', null);}
                                callback();
                            });
                        });
                    },

                    // checagem / pré análise
                    (callback) => {
                        async.parallel([
                            // checa o atendimento
                            (callbackInterno) => {
                                conexao.query(`SELECT a.id, a.status, a.profissional_id, a.servico_id, a.procedimento, a.demo, 
                                    IFNULL(c.nome, 'Particular') AS convenio 
                                    FROM atendimento a
                                    LEFT JOIN convenio c ON (c.id = a.convenio_id)
                                    WHERE a.id = ? AND a.empresa_id = ? LIMIT 1`, 
                                [atendimentoID, empresaID], (err, result) => {
                                    if( err || !result ) return callbackInterno('Erro interno');
                                    if( result.length === 0 ) return callbackInterno('Esse atendimento parece não existir');
                                    if( result[0].status != 4 ) return callbackInterno('O atendimento precisa esta em curso para ser cancelado');
        
                                    if( user.profissional_id != result[0].profissional_id ) {
                                        return callbackInterno('Esse atendimento pertence a outro profissional');
                                    }
                                    
                                    atm = result[0];
                                    callbackInterno();
                                });
                            },
                            // pega o status anterior
                            (callbackInterno) => {
                                conexao.query('SELECT status FROM atendimento_status WHERE atendimento_id = ? ORDER BY id DESC LIMIT 2', [atendimentoID], (err, result) => {
                                    if( err || !result ) return callbackInterno('Erro interno');
                                    if( result.length < 2 ) return callbackInterno('Erro ao localizar status anterior'); // não tiver pelo menos 2 status (atual e anterior), não pode realizar a operação
                                    novoStatus = result[1].status;// 0 = atual, 1 = imediatamente anterior (o novo status), 2 = penultimo...
                                    if( novoStatus == 5 || novoStatus == 4 ) return callbackInterno('O status anterior inválido'); // não pode voltar para 
                                    callbackInterno();
                                });
                            }
                        ], 
                        (err) => callback( err ) );
                    },

                    ////////////// ALTERA O BANCO DE DADOS
                    (callback) => {
                        let agora = new Date();
                        async.parallel([
                            // cria novo status
                            (callbackInterno) => {
                                const insert = {
                                    atendimento_id: atendimentoID,
                                    usuario_id: user.id,
                                    status: novoStatus,
                                    data: agora,
                                    obs: obs
                                };
                                conexao.query('INSERT INTO atendimento_status SET ?', [insert], (err, result) => {
                                    if( err || !result ) return callbackInterno('erro interno');
                                    callbackInterno();                        
                                });
                            },
                            // atualiza a tabela 'atendimento' com o status e hora da mudança
                            (callbackInterno) => {
                                let update = {status: novoStatus, status_data: agora};
                                conexao.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [update, atendimentoID, empresaID], (err, result) => {
                                    if( err || !result ) return callbackInterno('erro interno');
                                    callbackInterno();
                                });
                            },

                            // remove o prontuário relacionado ao atendimento
                            (callbackInterno) => {
                                if( preservarProntuario === true ) return callbackInterno(); // o usuário não quer excluir
                                conexao.query('DELETE FROM atendimento_has_prontuario_item WHERE atendimento_id = ? AND empresa_id = ?', [atendimentoID, empresaID], (err, result) => {
                                    if( err || !result ) return callbackInterno('Erro interno');
                                    callbackInterno();
                                });
                            }
                        ], 
                        (err) => callback( err ) );
                    },

                    // Remove os anexos relacionado ao atendimento
                    (callback) => {
                        let anexos = [];
                        async.series([
                            // pega os 
                            (callbackInterno) => {
                                if( preservarProntuario === true ) return callbackInterno(); // o usuário não quer excluir
                                conexao.query('SELECT nome, arquivo FROM atendimento_anexo WHERE atendimento_id = ? AND empresa_id = ?', [atendimentoID, empresaID], (err, result) => {
                                    if( err || !result ) return callbackInterno('Erro interno');
                                    anexos = result;
                                    callbackInterno();
                                });
                            },

                            // remove o registro do anexo no banco de dados
                            (callbackInterno) => {
                                if( preservarProntuario === true || anexos.length === 0 ) return callbackInterno(); // o usuário não quer excluir ou não foi encontrado anexos para remover
                                conexao.query('DELETE FROM atendimento_anexo WHERE atendimento_id = ? AND empresa_id = ?', [atendimentoID, empresaID], (err, result) => {
                                    if( err || !result ) return callbackInterno('Erro interno');
                                    callbackInterno();
                                });
                            },
                            
                            // remove os anexos do storage
                            (callbackInterno) => {
                                if( preservarProntuario === true || anexos.length === 0 ) return callbackInterno(); // o usuário não quer excluir ou não foi encontrado anexos para remover
                                let pastaRemota = storage.getPastaProntuario( empresaID, user.id );

                                async.each( anexos, ( anexo, callbackStorage ) => {
                                    storage.deletaArquivo( `${pastaRemota}/${anexo.arquivo}` )
                                    .then( () => {
                                        callbackStorage();
                                    })
                                    .catch( erro => {
                                        /**
                                         * Quando o arquivo nã existe no Storage, não gera um erro, apenas deve 
                                         * remover o registro do DB
                                         */
                                        if( erro.code === 404 ) {
                                            return callbackStorage();
                                        }
                                        else {
                                            anexoNaoRemovidos.push( anexo );
                                            callbackStorage();// erro interno ao remover anexo, não está saindo com erro para não impedir de remover
                                        }
                
                
                                        let msg = `Falha ao remover anexo do prontuário ao cancelar atendimento
                                        Código de erro: ${erro.code}
                                        Arquivo: ${pastaRemota}/${anexo.arquivo}
                                        ID da empresa: ${empresaID}`;
                                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/agenda/agenda.js');
                                    });
                                }, (erro) => {
                                    callbackInterno( erro );
                                });// async
                            }
                        ],
                        (err) => callback (err) );// async
                    }
                ], 
                (err) => { // fim do processamento
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    
                    conexao.commit((err)=> {
                        if(err) {
                            conexao.rollback(()=> conexao.release() );
                            return reject('Erro interno no commit');
                        }
                        conexao.release();
                        resolve( novoStatus );// retornar também os anexos não removidos...
                        evento.emit( `${prefixoEvento}mudaStatusAtendimento`, empresaID, atendimentoID, novoStatus );

                        // envia os dados para a agenda do google
                        if( atm.demo != 's' ) {
                            atm.status = novoStatus;
                            agendaUtil.atualizaAgendamentoNoGoogleCalendar( empresaID, atm.profissional_id, user.id, atm );
                        }
                    });
                });
            });
        } // cancelarAtendimento
        
        /*
         *  Atualiza o pagamento
         */
        function informaPagamento(empresaID, atendimentoID, pagamento) {
            return new Promise( function ( resolve, reject){
                validar.validaPagamento(empresaID, atendimentoID, pagamento).then(function(value){
                    if(!value.acrescimo)    value.acrescimo = null;
                    if(!value.desconto)     value.desconto = null;
                    if(!value.pg_valor)     value.pg_valor = null;
                    if(!value.pg_dt)        value.pg_dt = null;
                    if(!value.pg_dt_cheque) value.pg_dt_cheque = null;
                    if(!value.pg_parcelas)  value.pg_parcelas = null;
                    if(!value.pg_forma)     value.pg_forma = null;
                    if(!value.pg_obs)       value.pg_obs = null;
                    if(!value.convenio_cod) value.convenio_cod = null;
                    
                    mysql.query('UPDATE atendimento SET ? WHERE id = ? AND empresa_id = ?', [value, atendimentoID, empresaID], function(err, result){
                        if(err || !result) return reject('Erro interno');
                        resolve();
                        evento.emit( `${prefixoEvento}informaPagamento`, empresaID, atendimentoID, value );
                    });
                }).catch(function(err){
                    reject(err);
                });
            });
        } // informaPagamento
        
        /*--------------- Para listagem dos atendimentos --------------*/
        function _getWhere (empresaID, user, where) {
            let _where = 'a.empresa_id = ?';
            let find = [empresaID];

            // se o usuário for um profissinal, retornar apenas seus atendimentos
            if( user.perfil == 'p') {
                _where += ' AND a.profissional_id = ?';
                find.push( user.profissional_id );
            }

            if(where && _.isObject(where)) {
                if(_.has(where, 'status') && _.isArray(where.status) && !_.isEmpty(where.status)) {
                    _where += ' AND a.status IN ?'; 
                    find.push([where.status]);
                }
                if(_.has(where, 'paciente') && _.isArray(where.paciente) && !_.isEmpty(where.paciente)) {
                    _where += ' AND a.cliente_id IN ?';
                    find.push([where.paciente]);
                }
                if(user.perfil != 'p' && _.has(where, 'medico') && _.isArray(where.medico) && !_.isEmpty(where.medico)) {
                    _where += ' AND a.profissional_id IN ?';
                    find.push([where.medico]);
                }
                if(_.has(where, 'servico') && _.isArray(where.servico) && !_.isEmpty(where.servico)) {
                    _where += ' AND a.servico_id IN ?';
                    find.push([where.servico]);
                }
                if(_.has(where, 'convenio') && _.isArray(where.convenio) && !_.isEmpty(where.convenio)) {
                    if(_.contains(where.convenio, null)) { // também particular
                        _where += ' AND (a.convenio_id IN ? OR a.convenio_id IS NULL)';
                    }else{ // somente com os convênios informados
                        _where += ' AND a.convenio_id IN ?';
                    }
                    find.push([where.convenio]);
                }
                if(_.has(where, 'data') && _.isObject(where.data)) {
                    if(_.has(where.data, 'inicio') && !_.isEmpty(where.data.inicio) && _.has(where.data, 'fim') && !_.isEmpty(where.data.fim)){
                        _where += ' AND CAST(a.dt_agenda AS date) BETWEEN ? AND ?';
                        find.push([where.data.inicio]);
                        find.push([where.data.fim]);
                    }
                }
                if(_.has(where, 'pagamento') && _.isNumber(where.pagamento)) {
                    let pg = parseInt(where.pagamento);
                    if(pg === 1) { // pago totalmente
                        _where += ' AND (IFNULL(a.pg_valor,0) >= (a.valor - IFNULL(a.desconto, 0) + IFNULL(a.acrescimo, 0)))';
                    }
                    if(pg === 2) { // pago parcialmente
                        _where += ' AND (IFNULL(a.pg_valor,0) > 0 AND IFNULL(a.pg_valor,0) < (a.valor - IFNULL(a.desconto,0) + IFNULL(a.acrescimo,0)))';
                    }
                    if(pg === 3) { // não pago
                        _where += ' AND (IFNULL(a.pg_valor,0) = 0 AND (a.valor - IFNULL(a.desconto,0) + IFNULL(a.acrescimo,0)) > 0)';
                    }
                }

                if(_.has(where, 'consulta') && !_.isEmpty(where.consulta)) {
                    if(where.consulta == 'c') {
                        _where += ' AND a.atendimento_id IS NULL'; 
                    }
                    if(where.consulta == 'r') {
                        _where += ' AND a.atendimento_id IS NOT NULL'; 
                    }
                    if(where.consulta == 'cr') {// consulta com retorno
                        _where += ' AND a.tem_retorno > 0'; 
                    }
                }
                
                if(_.has(where, 'id') && _.isNumber(where.id)) {
                    _where += ' AND a.id = ?';
                    find.push(where.id);
                }
            }

            return {where: _where, find: find};
        } // _getWhere
        
        function totalAtendimentos(empresaID, user, where) {
            return new Promise( function ( resolve ) {  
                let t = _getWhere(empresaID, user, where);

                mysql.query(`SELECT count(*) AS total FROM v_atendimento a WHERE ${t.where}`, t.find, function(err, result){
                    if(err || !result) return resolve(0);
                    if(result.length == 0) return resolve(0);
                    resolve( result[0].total );
                });
            });
        }//totalAtendimentos
        
        /**
         * A partir de 19/08/2019 retorna todos os atendimentos que correspondem
         * aos critérios de busca, ou seja, inclusive os retornos. Antes os retornos
         * era rotornado como um sub-registro da consulta
         */
        function getAtendimentos(empresaID, user, where, pagina, ordem) {
            return new Promise( function ( resolve ) {
                let t = _getWhere(empresaID, user, where);
                let max = 15;
                pagina = parseInt(pagina) || 1;
                pagina = (pagina - 1) * max;
                
                t.find.push(pagina);
                t.find.push(max);
                
                // ordem de busca
                let orderBy = 'a.dt_cadastro DESC';
                if(ordem && _.isObject(ordem)){
                    let d = 'DESC';
                    if(_.has(ordem, 'ordem') && ordem.ordem == 'asc') d = 'ASC';
                    switch (ordem.item) {
                        case 'servico': orderBy = 'a.procedimento ' +d;break;
                        case 'paciente':orderBy = 'c.nome ' +d;break;
                        case 'medico':  orderBy = 'p.nome ' +d;break;
                        case 'status':  orderBy = 'a.status ' +d;break;
                        case 'valor':   orderBy = 'a.valor ' +d;break;
                        case 'data':    orderBy = 'a.dt_agenda ' +d;break;
                        case 'convenio':orderBy = 'cv.nome ' +d;break;
                        case 'id':orderBy       = 'a.id ' +d;break;
                    }
                }

                let select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
                    DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i") AS dt_status,
                    a.dt_fim_atendimento, a.procedimento, a.convenio_cod, 
                    a.dt_servico, a.preferencia_prof, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
                    c.nome AS cliente_nome, cv.nome AS convenio_nome, cv.id AS cvID, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE ${t.where}
                    ORDER BY ${orderBy} LIMIT ?,?`;
                
                let retorno = [];
                mysql.query(select, t.find, function(err, result){
                    if(err || !result) return resolve([]);
                    if(result.length == 0) return resolve([]);
                    
                    async.each(result, function(a, callback){
                        a.retornos = [];
                        retorno.push(a);
                        callback();
                        // if(!a.tem_retorno) {
                        //     retorno.push(a);
                        //     callback();
                        // } else {
                        //     getRetornos(a, callback);
                        // }
                    }, function(err){
                        resolve(retorno);
                    });
                });
            });
        }//getAtendimentos
        
        function getAtendimento(empresaID, user, atendimentoID) {
            return new Promise( ( resolve )=> {

                let where = 'a.empresa_id = ? AND a.id = ?';
                let cols = [empresaID, atendimentoID];

                // se profissional, retorna apenas a si mesmo
                if(user.perfil === 'p') {
                    where += ' AND a.profissional_id = ?';
                    cols.push( user.profissional_id );
                }

                const select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
                    DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i") AS dt_status,
                    a.dt_fim_atendimento, a.procedimento, a.convenio_cod,
                    a.dt_servico, a.preferencia_prof, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
                    c.nome AS cliente_nome, cv.nome AS convenio_nome, cv.id AS cvID, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE ${where} LIMIT 1`; // a.id = ? AND a.empresa_id = ?

                mysql.query(select, cols, (err, result) =>{
                    if(err || result.length == 0) return resolve(null);
                    resolve(result[0]);
                });
            });
        }//getAtendimento
        
        /*
         * Retorna os últimos atendimentos cadastrados, para o dashboard
         */
        function ultimosAtendimentos(empresaID, user ) {
            let where = 'a.empresa_id = ?';
            let cols = [empresaID];
            
            // se profissional, retorna apenas seus atendimentos
            if(user.perfil === 'p') {
                where += ' AND a.profissional_id = ?';
                if( !user.profissional_id ) return resolve([]);
                cols.push( user.profissional_id );
            }

            return new Promise( function ( resolve ) {                
                const select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
                    DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i") AS dt_status,
                    a.dt_fim_atendimento, a.procedimento, a.convenio_cod,
                    a.dt_servico, a.preferencia_prof, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
                    c.nome AS cliente_nome, cv.nome AS convenio_nome, cv.id AS cvID, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE ${where} ORDER BY a.id DESC LIMIT 10`;

                mysql.query(select, cols, function(err, result){
                    if(err || result.length == 0) return resolve([]);
                    resolve(result);
                });
            });
        }//ultimosAtendimentos
        
        /*
         * Muda a coluna preferencia_prof
         * Diz se o cliente faz questão de ser atendido por um profissional X
         */
        function mudaPreferenciaProfissional(empresaID, atendimentoID, status) {
            status = status.toString();
            if(!(status === 's' || status === 'n')) return;
            mysql.query('UPDATE atendimento SET preferencia_prof = ? WHERE id = ? AND empresa_id = ?', [status, atendimentoID, empresaID]);
            evento.emit( `${prefixoEvento}mudaPreferenciaProfissional`, empresaID, atendimentoID, status );
        } // mudaPreferenciaProfissional
    }
    
    if(instance === null) instance = new Agenda();
    module.exports = Agenda;
    Agenda.Agenda = instance;
}());