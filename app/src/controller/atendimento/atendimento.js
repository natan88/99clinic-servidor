/* jshint -W030 */
{ 
    "use strict";

    /**
     * O profissional Realiza atendimentos, preenche os prontuários.
     * 
     * Faz a gestão dos atendimentos em curso, hora que começou, hora que terminou,
     * se há algo pendente (iniciado e não terminado, por exemplo) e também
     * preenche os prontuários, exibe o histórico de cada campo do prontuário
     * 
     * Resumidamente, é a interface de atendimento do profissional
     */

    const 
        mysql = require('src/util/conexoes.js'),
        validacao = require('./atendimento-validacao'),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos'),
        async = require('async'),
        fs = require('fs'),
        log = require('src/util/logInterno'),
        storage = require('src/lib/storage/googleStorage');

    class Atendimento {
        constructor( usuario ) {
            this.empresaID = usuario.empresa_id;
            this.usuario = usuario; // usuário logado, do aperto de mão
            this.historicoPorPagina = 15;
            this.atendimentosPorPagina = 10;
        }


        getWhere ( where ) {
            let _where = '';
            let find = [ ];

            if(where && _.isObject(where)) {
                if(_.has(where, 'status') && _.isArray(where.status) && !_.isEmpty(where.status)) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'a.status IN ?'; 
                    find.push([where.status]);
                }

                if(_.has(where, 'paciente') && _.isArray(where.paciente) && !_.isEmpty(where.paciente)) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'a.cliente_id IN ?';
                    find.push([where.paciente]);
                }

                if(_.has(where, 'servico') && _.isArray(where.servico) && !_.isEmpty(where.servico)) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'a.servico_id IN ?';
                    find.push([where.servico]);
                }
                if(_.has(where, 'convenio') && _.isArray(where.convenio) && !_.isEmpty(where.convenio)) {
                    if( _where != '' ) _where += ' AND ';
                    if(_.contains(where.convenio, null)) { // também particular
                        _where += '(a.convenio_id IN ? OR a.convenio_id IS NULL)';
                    }else{ // somente com os convênios informados
                        _where += 'a.convenio_id IN ?';
                    }
                    find.push([where.convenio]);
                }
                if(_.has(where, 'data') && _.isObject(where.data)) {
                    if(_.has(where.data, 'inicio') && !_.isEmpty(where.data.inicio) && _.has(where.data, 'fim') && !_.isEmpty(where.data.fim)){
                        if( _where != '' ) _where += ' AND ';
                        _where += 'CAST(a.dt_agenda AS date) BETWEEN ? AND ?';
                        find.push( [where.data.inicio], [where.data.fim] );
                    }
                }
                
                // if(_.has(where, 'id') && _.isNumber(where.id) ) {
                if(_.has(where, 'id') ) {
                    where.id = Number.parseInt( where.id );
                    if( _where != '' ) {
                        _where = `((${_where}) OR ( a.id = ? ))`;
                    } else {
                        _where = 'a.id = ?';
                    }
                    find.push( where.id );                    
                }
            }

            if( _where != '' ) {
                _where += ' AND (a.empresa_id = ? AND a.profissional_id = ?)';
            } else {
                _where = 'a.empresa_id = ? AND a.profissional_id = ?';
            }

            find.push( this.empresaID, this.usuario.profissional_id );

            return {where: _where, find: find};
        }

        /**
         * o mesmo que a nova versão, porém não retorna sempre o atendimento passado pelo _where.id
         * NÃO ESTA EM USO
         */
        buscaAtendimentosAntigo ( _where, pagina ) {
            let t = this.getWhere( _where );
            
            pagina = Math.max(1, pagina || 0);
            if(pagina > 0) pagina--;
            pagina = Number(pagina * this.atendimentosPorPagina);

            return new Promise( ( resolve, reject ) => {
                const select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
                    DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i:%s") AS dt_status,
                    DATE_FORMAT(a.dt_fim_atendimento, "%Y-%m-%dT%H:%i:%s") AS dt_fim_atendimento, a.procedimento, a.convenio_cod, 
                    DATE_FORMAT(a.dt_servico, "%Y-%m-%dT%H:%i") AS dt_servico, a.preferencia_prof, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
                    c.nome AS cliente_nome, c.img, c.sexo AS cliente_sexo, DATE_FORMAT(c.nascimento, "%Y-%m-%d") AS cliente_nascimento, cv.nome AS convenio_nome, cv.id AS cvID, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id)
                    WHERE ${t.where} LIMIT ${pagina}, ${this.atendimentosPorPagina}`;

                mysql.query(select, t.find, (err, result) => {
                    if( err || !result ) return reject('Erro ao buscar atendimentos');
                    if( result.length == 0) return resolve([]);
                    resolve(result);
                });
            });
        }

        /**
         * Retornas atendimentos, de acordo com os critérios de busca
         * Essa implementação sempre retorna o atendimento de ID informado no 
         * critério de busca (_where.id)
         * FIXME: quando é passado um ID, deveria retornar apenas o 
         */
        _buscaAtendimentos ( _where, pagina, limit ) {
            return new Promise( ( resolve, reject ) => {
                let t = this.getWhere( _where );
                pagina = Math.max(1, pagina || 0);
                if(pagina > 0) pagina--;
                pagina = Number(pagina * limit);
// dt_fim_atendimento e dt_servico estava formatado assim: "%Y-%m-%dT%H:%i"
                const select = `SELECT a.id AS atID, a.cliente_id, a.servico_id, a.profissional_id, a.valor, DATE_FORMAT(a.dt_agenda, "%Y-%m-%dT%H:%i") AS dt_agenda, 
                    DATE_FORMAT(a.dt_cadastro, "%Y-%m-%dT%H:%i") AS dt_cadastro, DATE_FORMAT(a.dt_status, "%Y-%m-%dT%H:%i:%s") AS dt_status,
                    a.dt_fim_atendimento, a.procedimento, a.convenio_cod, 
                    a.dt_servico, a.preferencia_prof, a.status, a.obs, a.tem_retorno, a.atendimento_id AS retorno, a.checkin, 
                    IFNULL(a.desconto, 0) AS desconto, IFNULL(a.acrescimo, 0) AS acrescimo, IFNULL(a.pg_valor, 0) AS pg_valor, a.pg_dt, a.pg_dt_cheque, a.pg_forma, a.pg_parcelas, a.pg_obs, a.demo, 
                    c.nome AS cliente_nome, c.img, c.sexo AS cliente_sexo, DATE_FORMAT(c.nascimento, "%Y-%m-%d") AS cliente_nascimento, cv.nome AS convenio_nome, cv.id AS cvID, 
                    p.nome AS profissional_nome
                    FROM v_atendimento a 
                    LEFT JOIN cliente c ON (c.id = a.cliente_id)
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    LEFT JOIN profissional p ON (p.id = a.profissional_id) `;

                const baixaAtendimento = ( callback )  => {
                    if(!_.has(_where, 'id') ) { return callback(); }
                    
                        let find = [ Number.parseInt( _where.id ), this.empresaID, this.usuario.profissional_id ];
                        let w = 'a.id = ? AND a.empresa_id = ? AND a.profissional_id = ?';

                        mysql.query(select + `WHERE ${w} LIMIT 1`, find, (err, result) => {
                            if( err || !result ) return callback('Erro ao buscar atendimentos');
                            if( result.length == 0) return callback(null, []);
                            callback(null, result[0]);
                        });
                };

                const baixaAtendimentos = ( callback )  => {
                    let orderBy = `ORDER BY STATUS !=4, STATUS !=8, STATUS !=3, STATUS !=2, STATUS !=1, STATUS !=5, STATUS !=7, STATUS !=6, dt_servico DESC, dt_agenda ASC`;//, COALESCE(dt_servico, dt_agenda) ASC
                    mysql.query(select + `WHERE ${t.where} ${orderBy} LIMIT ${pagina}, ${limit}`, t.find, (err, result) => {
                        if( err || !result ) return callback('Erro ao buscar atendimentos');
                        if( result.length == 0) return callback(null, []);
                        callback(null, result);
                    });
                };

                async.parallel({
                    atendimento: baixaAtendimento,
                    atendimentos: baixaAtendimentos
                }, ( err, result ) => {
                    if( err ) return reject( err );

                    // junta os resultados, tomando cuidado para não duplicar o atendimento
                    if( result.atendimento ) {
                        let atmDuplicado = result.atendimentos.findIndex( a => a.atID == result.atendimento.atID );
                        if( atmDuplicado > -1 ) { result.atendimentos.splice( atmDuplicado, 1); }
                        result.atendimentos.unshift( result.atendimento );
                    }
                    resolve( result.atendimentos );
                });

            });
        }

        buscaAtendimentos ( _where, pagina ) {
            return this._buscaAtendimentos ( _where, pagina, this.atendimentosPorPagina );
        }

        buscaAtendimento ( _where ) {
            return new Promise( (resolve, reject ) => {
                this._buscaAtendimentos ( _where, 1, 1 )
                .then( result => {
                    resolve(result[0]);
                })
                .catch( erro => reject(erro) );
            });
        }

        buscaTotalAtendimentos ( _where ) {
            let t = this.getWhere( _where );

            return new Promise( ( resolve, reject ) => {
                const select = `SELECT count(*) AS total FROM v_atendimento a WHERE ${t.where}`;
                mysql.query(select, t.find, (err, result) => {
                    if( err || !result ) return reject('Erro ao buscar o total de atendimentos');
                    if( result.length == 0 ) return resolve(0);
                    resolve(result[0].total);
                });
            });
        }

        /**
         * Retorna estatísticas de atendimento de um profissional em um intervalo de datas
         * Informações retornadas: total agendado, total atendimentos realizados,
         * quantidade de pacientes aguardando
         * @param {Object} data objeto com 2 datas, data inicio e data final
         */
        buscaEstatisticas ( data ) {
            let where = '(a.empresa_id = ? AND a.profissional_id = ?)', 
            find = [this.empresaID, this.usuario.profissional_id];

            if( _.isObject( data )) {
                if(_.has( data, 'inicio') && !_.isEmpty( data.inicio) && _.has(data, 'fim') && !_.isEmpty( data.fim )){
                    where += ' AND (CAST(a.dt_agenda AS date) BETWEEN ? AND ?)';
                    find.push( [data.inicio], [data.fim] );
                }
            }

            return new Promise( ( resolve, reject ) => {
                const Agendado = callback => {
                    const select = `SELECT count(*) AS total FROM atendimento a WHERE ${where} AND status IN ('1','2')`;
                    mysql.query(select, find, (err, result) => {
                        if( err || !result ) return callback('Erro ao buscar estatísticas');
                        if( result.length == 0 ) return callback(null, 0);
                        callback(null, result[0].total);
                    });
                };

                const NaClinica = callback => {
                    const select = `SELECT count(*) AS total FROM atendimento a WHERE ${where} AND status IN ('3','8')`;
                    mysql.query(select, find, (err, result) => {
                        if( err || !result ) return callback('Erro ao buscar estatísticas');
                        if( result.length == 0 ) return callback(null, 0);
                        callback(null, result[0].total);
                    });
                };

                const Atendido = callback => {
                    const select = `SELECT count(*) AS total FROM atendimento a WHERE ${where} AND status = '5'`;
                    mysql.query(select, find, (err, result) => {
                        if( err || !result ) return callback('Erro ao buscar estatísticas');
                        if( result.length == 0 ) return callback(null, 0);
                        callback(null, result[0].total);
                    });
                };

                async.parallel({
                    atendido: Atendido,
                    agendado: Agendado,
                    aguardando: NaClinica
                }, 
                ( err, result ) => {
                    if( err ) return reject( err );
                    resolve( result );
                });
            });
        }


        /**
         * Retorna informações sobre o paciente relacionado a atendimentos
         * - se é primeira consulta
         * - total de consultas realizadas
         * 
         * Considera os atendimentos realizados na clínica, por todos os profissionais
         * 
         * @param {int} pacienteID PK do paciente
         */
        buscaEstatisticaPaciente ( pacienteID ) {
            return new Promise( ( resolve, reject ) => {
                if( !pacienteID ) return reject('Não foi possível baixar estatística por falta do ID do paciente');
                let where = 'a.empresa_id = ? AND a.cliente_id = ? AND a.status = 5'; 
                mysql.query(`SELECT count(*) AS total FROM atendimento a WHERE ${where}`, [this.empresaID, pacienteID], (err, result) => {
                    if( err || !result ) return reject('Erro ao buscar estatísticas');
                    if( result.length == 0 ) return resolve(0);
                    resolve( result[0].total );
                });
            });
        }

        /**
         * atendimentoID, prontuarioID
         * Retorna apenas se a "CONSULTA" estiver com status 'em atendimento' (4)
         * 
         * Se tive passado prontuarioID, o retorno é um array, caso contrário um objeto
         * Se não for encontrado resultado, retorna "NULL"
         * 
         * DICA: olhar para prontuario-validacao.js/planoAssinatura e ver se a 
         * solução encontrada lá é melhor que essa
         * 
         * @param {int} atendimentoID PK do atendimento
         * @param {int} prontuarioID PK do prontuario, OPCIONAL
         */
        getRespostasProntuario ( atendimentoID, prontuarioID ) {
            if( !_.isNumber( atendimentoID ) ) atendimentoID = parseInt( atendimentoID );
            if( !_.isNumber( prontuarioID ) ) prontuarioID = parseInt( prontuarioID );
            
            return new Promise( ( resolve, reject ) => {
                let where = 'a.status = 4 AND r.empresa_id = ? AND r.profissional_id = ? AND r.atendimento_id = ?';
                let cols = [ this.empresaID,  this.usuario.profissional_id, atendimentoID ];

                if( prontuarioID ) {
                    where += ' AND r.prontuario_item_prontuario_id = ?';
                    cols.push( prontuarioID );
                }

                mysql.query(`SELECT r.prontuario_item_id AS id, r.resposta, r.prontuario_item_prontuario_id AS prontuario_id
                    FROM atendimento_has_prontuario_item r
                    LEFT JOIN atendimento a ON (a.id = r.atendimento_id)
                    WHERE ${where}`, cols,
                ( err, res ) => {
                    if( err || !res ) return reject();
                    if( res.length === 0 ) return resolve( null );

                    res.forEach(c => {
                        c.resposta = JSON.parse( c.resposta );
                    });
                    // se o resultado não for de um prontuário específico, retorna um objeto, caso contrário retorna um array
                    if( !prontuarioID ) {
                        res = _.groupBy( res, 'prontuario_id' ); // transforma em objeto, agrupado por prontuário
                    }
                    resolve( res );
                });
            });
        }

        getTotalProntuarioPaciente( pacienteID ) {
            return new Promise( ( resolve, reject ) => {
                if( !pacienteID ) return reject('Parâmetro faltando!');
                let where = 'r.empresa_id = ? AND r.profissional_id = ? AND r.cliente_id = ? AND a.status = 5';
                
                mysql.query(`SELECT r.atendimento_id FROM atendimento_has_prontuario_item r
                LEFT JOIN atendimento a ON (a.id = r.atendimento_id)
                WHERE ${where} 
                GROUP BY r.atendimento_id`, 
                [ this.empresaID, this.usuario.profissional_id, pacienteID ], 
                ( err, res ) => {
                    if( err || !res ) return reject('Erro interno');
                    resolve( res.length );
                });
            });
        }// getTotalProntuarioPaciente

        /**
         * Retorna os prontuários que um profissional preencheu de um paciente
         * agrupado por atendimento (apenas atendimentos concluído - status 5)
         * FIXME: paginar os resultados
         * @param {int} pacienteID PK do paciente
         * @param {int} pagina número da página a ser retornada
         * @param {boolean} paraImpressao se foi solicitado pela classe que irá fazer a impressão
         * @param {boolean} retornarAnexo Se deve retornar o anexo ou não, usado pela classe de impressão, 
         */
        getProntuarioPaciente( pacienteID, pagina, paraImpressao, retornarAnexo ) {
            if ( _.isUndefined(paraImpressao) ) paraImpressao = false;
            if ( _.isUndefined(retornarAnexo) ) retornarAnexo = false;

            return new Promise( ( resolve, reject ) => {
                if( !pacienteID ) return reject('Parâmetro faltando!');
               
                let respostas = [], anexos = [], atendimentos;
                /*
                * callback() = OK
                * callback(-1) = sem resultados
                * callback(1) = com erro
                */
                const Respostas = ( callback ) => {
                    pagina = Math.max(1, pagina);
                    if(pagina > 0) pagina--;
                    pagina = Number(pagina * this.historicoPorPagina);
                    
                    let where = 'r.empresa_id = ? AND r.profissional_id = ? AND r.cliente_id = ?';
                    let cols = [ this.empresaID,  this.usuario.profissional_id, pacienteID ];
    
                    mysql.query(`SELECT r.prontuario_item_id AS id, pi.nome, pi.conf, r.resposta, r.tipo, r.prontuario_item_prontuario_id AS prontuario_id, 
                        r.prontuario_item_prontuario_id AS prontuario_id, r.atendimento_id, p.nome AS prontuario_nome, 
                        r.dt_cadastro AS data
                        FROM atendimento_has_prontuario_item r
                        LEFT JOIN prontuario_item pi ON ( pi.id = r.prontuario_item_id AND pi.versao = r.prontuario_item_versao )
                        LEFT JOIN prontuario p ON ( p.id = r.prontuario_item_prontuario_id )
                        WHERE ${where} 
                        ORDER BY r.atendimento_id DESC, pi.ordem ASC`, 
                    cols, ( err, res ) => {
    
                        if( err || !res ) return callback( 1 );
                        if( res.length === 0 ) return callback( );
    
                        res.forEach(c => {
                            c.resposta = JSON.parse( c.resposta );
                            if( c.conf ) c.conf = JSON.parse( c.conf );
                            else delete c.conf;
                        });
    
                        // agrupa as respostas
                        respostas = res;
                        callback();
                    });
                };// Respostas

                const Anexos = ( callback ) => {
                    if( !retornarAnexo ) return callback();

                    let select = `id, tipo, nome, descricao, arquivo, dt_cadastro, atm_concluido, atendimento_id`;
                    let where = 'empresa_id = ? AND profissional_id = ? AND cliente_id = ?';
                    if( paraImpressao ) {
                        select = `nome, arquivo, atendimento_id`;
                        where += ` AND tipo = 'img' AND arquivo IS NOT NULL`;
                    }

                    mysql.query(`SELECT ${select} FROM atendimento_anexo WHERE ${where}`, 
                    [ this.empresaID,  this.usuario.profissional_id, pacienteID ],
                    ( err, res ) => {

                        if( err || !res ) return callback( 1 );
                        if( res.length === 0 ) return callback();
                        
                        anexos = res;
                        callback();
                    });
                };

                const Atendimentos = ( callback ) => {
                    // pega os IDs dos atendimentos presentes nas respostas do prontuário
                    let idsAtendimento = _.uniq(_.pluck(respostas, 'atendimento_id'));
                    if( !idsAtendimento || idsAtendimento.length == 0 ) idsAtendimento = [];

                    // pega os IDs dos atendimentos presentes nos anexos
                    let idsAnexos = _.uniq(_.pluck(anexos, 'atendimento_id'));
                    if( !idsAnexos || idsAnexos.length == 0 ) idsAnexos = [];

                    // junta os IDs dos atendimentos
                    idsAtendimento = _.uniq( idsAtendimento.concat( idsAnexos ) );
                    if( !idsAtendimento || idsAtendimento.length == 0 ) return callback( -1 );

                    let cols = [ this.empresaID,  this.usuario.profissional_id, pacienteID, idsAtendimento ];

                    mysql.query(`SELECT a.id, a.dt_servico, a.dt_fim_atendimento, 
                    a.procedimento, a.status, 
                    cv.nome AS convenio_nome
                    FROM atendimento a 
                    LEFT JOIN convenio cv ON (cv.id = a.convenio_id)
                    WHERE a.empresa_id = ? AND a.profissional_id = ? AND a.cliente_id = ? AND a.id IN (?) AND a.status = '5'
                    ORDER BY a.dt_servico DESC`, 
                    cols, (err, res ) => {
                        if( err || !res ) return callback( 1 );
                        if( res.length === 0 ) return callback( -1 );
                        
                        // coloca as respostas e anexos nos atendimentos
                        let temp, el;
                        for (const at of res) {
                            // pega os anexos do atendimentos
                            at.anexo = anexos.filter( a => a.atendimento_id == at.id );

                            // pega as respostas do prontuário
                            temp =  _.groupBy( respostas.filter( r => r.atendimento_id == at.id ), (i => i.prontuario_id ) );
                            at.form = [];
                            if( !temp ) continue;
                               
                            for (const k in temp) {
                                if (temp.hasOwnProperty(k)) {
                                    el = temp[k];

                                    at.form.push({
                                        nome: el[0].prontuario_nome,
                                        prontuario_id: el[0].prontuario_id,
                                        data: el[0].data,
                                        campos: el.map( x => { 
                                            let r = {id: x.id, nome: x.nome, resposta: x.resposta, tipo: x.tipo, conf: x.conf};
                                            if( x.conf ) r.conf = x.conf;
                                            return r;
                                        })
                                    });
                                }
                            }
                        }

                        atendimentos = res;
                        callback();
                    });
                };

                // processa
                async.series([
                    Respostas, Anexos, Atendimentos
                ], ( err, result ) => {
                    if( err ) {
                        if( err === -1 ) return resolve();
                        return reject('Erro interno ao buscar prontuário');
                    }
                    resolve( atendimentos );
                });
            });
        }// getProntuarioPaciente

        /**
         * Retorna o protuário de um atendimento já concluído
         * Se for paraImpressao, não retornar anexos
         * 
         * Os parametros 'paraImpressao', 'prontuarioID' e 'retornarAnexo' são passados apenas
         * quando é solicitado pela classe de impressão
         */
        getProntuarioAtendimento( atendimentoID, prontuarioID, paraImpressao, retornarAnexo ) {
            if ( _.isUndefined(paraImpressao) ) paraImpressao = false;
            if ( _.isUndefined(retornarAnexo) ) retornarAnexo = false;

            return new Promise( ( resolve, reject ) => {
                if( !atendimentoID ) return reject('Parâmetro faltando!');  
                
                let respostas = [], anexos = [];
                
                /*
                * callback() = OK
                * callback(-1) = sem resultados
                * callback(1) = com erro
                */
                const Respostas = ( callback ) => {
                    let where = 'r.empresa_id = ? AND r.profissional_id = ? AND r.atendimento_id = ?';
                    let cols = [ this.empresaID,  this.usuario.profissional_id, atendimentoID ];

                    /**
                     * Se for para imprimir apenas uma seção de prontuário específica 
                     * Usado apenas em impressão
                     */
                    if( prontuarioID && _.isNumber( prontuarioID) ) {
                        where += ' AND r.prontuario_item_prontuario_id = ?';
                        cols.push( prontuarioID );
                    }

                    mysql.query(`SELECT r.prontuario_item_id AS id, pi.nome, pi.conf, r.resposta, r.tipo, r.prontuario_item_prontuario_id AS prontuario_id, 
                        r.prontuario_item_prontuario_id AS prontuario_id, p.nome AS prontuario_nome, 
                        r.dt_cadastro AS data
                        FROM atendimento_has_prontuario_item r
                        LEFT JOIN prontuario_item pi ON ( pi.id = r.prontuario_item_id AND pi.versao = r.prontuario_item_versao )
                        LEFT JOIN prontuario p ON ( p.id = r.prontuario_item_prontuario_id )
                        WHERE ${where} 
                        ORDER BY r.atendimento_id DESC`, 
                    cols, ( err, res ) => {

                        if( err || !res ) return callback( 1 );
                        if( res.length === 0 ) return callback( );

                        res.forEach(c => {
                            c.resposta = JSON.parse( c.resposta );
                            if( c.conf ) c.conf = JSON.parse( c.conf );
                            else delete c.conf;
                        });

                        res =  _.groupBy( res, (i => i.prontuario_id ) ); 
                        
                        let el, form = [];
                        for (const k in res) {
                            el = res[k];
                            form.push({
                                nome: el[0].prontuario_nome,
                                prontuario_id: el[0].prontuario_id,
                                data: el[0].data,
                                campos: el.map( x => { 
                                    let r = {id: x.id, nome: x.nome, resposta: x.resposta, tipo: x.tipo}; 
                                    if( x.conf ) r.conf = x.conf;
                                    return r;
                                })
                            });
                        }

                        respostas = form;
                        callback();
                    });
                };

                const Anexos = ( callback ) => {
                    if( !retornarAnexo ) return callback();

                    let select = `id, tipo, nome, descricao, arquivo, dt_cadastro, atm_concluido, atendimento_id`;
                    let where = 'empresa_id = ? AND profissional_id = ? AND atendimento_id = ?';
                    if( paraImpressao ) {
                        select = `nome, arquivo, atendimento_id`;
                        where += ` AND tipo = 'img' AND arquivo IS NOT NULL`;
                    }


                    mysql.query(`SELECT ${select} FROM atendimento_anexo WHERE ${where}`, 
                    [ this.empresaID,  this.usuario.profissional_id, atendimentoID ],
                    ( err, res ) => {

                        if( err || !res ) return callback( 1 );
                        if( res.length === 0 ) return callback();
                        
                        anexos = res;
                        callback();
                    });
                };

                // processa
                async.parallel([
                    Respostas, Anexos
                ], ( err, result ) => {
                    if( err ) {
                        if( err === -1 ) return resolve();
                        return reject('Erro interno ao buscar prontuário');
                    }
                    
                    resolve( { form: respostas, anexo: anexos } );
                });
                // fim processa
            });
        }// getProntuarioAtendimento

        /**
         * Salva a resposta de um prontuário X em um atendimento X
         * 
         * REGRAS
         * - apenas o profissional, dono do atendimento, pode realizar essa operação
         * - o atendimento deve esta com o status 4 ('em atendimento')
         * 
         * @param {int} atendimentoID PK do atendimento
         * @param {int} prontuarioID PK do prontuário do qual os campos fazem parte
         * @param {array} campos as respostas dos campos que serão salvas
         */
        salvaProntuario( atendimentoID, prontuarioID, campos ) {
            return new Promise( (resolve, reject ) => {
                let data, conexao;

                const validar = ( callback ) => {
                    validacao.validaResposta( this.empresaID, this.usuario, prontuarioID, atendimentoID, campos ).then(( _data) =>{
                        data = _data;
                        callback(null, _data );
                    }).catch((erro)=> {
                        callback(erro);
                    });
                };

                const transaction = (callback)=> {
                    let pool = mysql.pool;
                    pool.getConnection((err, connection)=> {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction((err)=> {
                            if (err) { return callback('erro interno');}
                            callback();
                        });
                    });
                };

                const removeRespostaAnterior = ( callback ) => {
                    conexao.query(`DELETE FROM atendimento_has_prontuario_item WHERE empresa_id = ? AND atendimento_id = ? AND prontuario_item_prontuario_id = ?
                    AND prontuario_item_id`, 
                    [ this.empresaID, atendimentoID, prontuarioID],
                    (err, res) => {
                        if( err || !res ) return callback('Erro interno ao atualizar dados');
                        callback();
                    });
                };

                const registraRespostaAtual = ( callback ) => {
                    if(_.isEmpty( data.campos )) return callback();
                    let insertCampos = [];
                    let resposta;
                    async.each( data.campos, (campo, callbackEach)=> {
                        resposta = JSON.stringify( campo.resposta );

                        insertCampos.push([ this.empresaID, atendimentoID, data.cliente_id, data.profissional_id, campo.id, campo.versao, campo.tipo, prontuarioID, resposta] );
                        callbackEach();
                    }, (err) => {
                        if(err) return callback(err);
                        if(_.isEmpty(insertCampos)) return callback();

                        conexao.query(`INSERT INTO atendimento_has_prontuario_item (empresa_id, atendimento_id, cliente_id,
                            profissional_id, prontuario_item_id, prontuario_item_versao, 
                            tipo, prontuario_item_prontuario_id, resposta) VALUES ?`, 
                        [insertCampos], (err, res)=> {
                            if(err || res.length == 0) return callback('Erro interno ao registrar campos do formulário');
                            callback();
                        });
                    });
                };

                async.series([
                    validar, transaction, removeRespostaAnterior, registraRespostaAtual
                ], (err, result) => {
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        // a conexão pode não existir, pois pode não ser executada a função 'transaction'
                        if( conexao ) conexao.rollback(() => conexao.release() );
                    }else{
                        conexao.commit((err)=> {
                            if(err) {
                                conexao.rollback(()=> conexao.release() );
                                reject('Erro interno no commit');
                            }else {
                                conexao.release();
                                resolve();
                                evento.emit('atendimento.prontuarioAtualizado', this.empresaID, this.usuario.id, atendimentoID, prontuarioID );
                            }
                        });
                    }
                });
            });
        }

        /**
         * Etapa 1 do envio de anexos
         * Nessa etapa apenas metadados são enviados
         * 
         * @param {Integer} atendimentoID PK do atendimento
         * @param {Array} dados metadata de cada arquivo
         */
        enviaArquivosEtapaUm ( atendimentoID, dados ) {
            return new Promise( (resolve, reject ) => {
                let data, anexoID;

                const validar = ( callback ) => {
                    validacao.validaAnexosEtapaUm( this.empresaID, this.usuario, atendimentoID, dados )
                    .then(( _data) =>{
                        data = _data;
                        callback( );
                    }).catch((erro)=> {
                        callback( erro );
                    });
                };

                const gravaDados = ( callback ) => {
                    data.empresa_id = this.empresaID;
                    data.atendimento_id = atendimentoID;
                    data.profissional_id = this.usuario.profissional_id;

                    mysql.query(`INSERT INTO atendimento_anexo SET ?`, [data], ( err, result ) => {
                        if( err || !result ) return callback( 'Erro interno ao registrar dados' );
                        if( !result.insertId ) return callback( 'Erro interno ao registrar dados (E2)' );
                        
                        anexoID = result.insertId;
                        callback();
                    });
                };

                // PROCESSA
                async.series([
                    validar, gravaDados
                ], (err, result) => {
                    if(err) return reject(err);
                        
                    resolve( anexoID );
                    // evento.emit('atendimento.xxx', this.empresaID, this.usuario.id, atendimentoID, prontuarioID );
                });
            });
        }

        // etapa em que é gravado o arquivo
        /**
         * Etapa que grava o arquivo no Google Storage
         * 
         * Essa etapa não esta checando os dados pois foi feito no momento anterior,
         * na requisição HTTP
         * 
         * 
         * @param {Integer} dados.atendimentoID pk do atendimento
         * @param {Integer} dados.anexoID pk do anexo
         * @param {Integer} dados.size tamanho do arquivo, identificado no servidor (multer)
         * @param {String} nomeArquivo nome do arquivo no Google Storage
         * @param {String} filePath endereço completo com o nome do arquivo no Google Storage. Ex: empresa/1/usuario/4/prontuario/arquivo-nmome.jpg
         */
        enviaArquivosEtapaDois ( dados, nomeArquivo, filePath ) {
            return new Promise( ( resolve, reject ) => {
                /**
                 * Se for encontrado um erro ao salvar os dados no banco,
                 * chama essa função para:
                 * - remover o arquivo do google estorage
                 * - registrar no próprio arquivo o erro
                 */
                const trataErro = ( mensagemDeErro ) => {
                    reject( mensagemDeErro );

                    // apaga o arquivo no google storage
                    storage.deletaArquivo( filePath )
                    .then( () => {})
                    .catch( erro => {
                        let msg = `Falha ao apagar do anexo prontuário (motivo: não atualizou o DB corretamente) \nCódigo de erro: ${erro.code} \nID da empresa: ${this.empresaID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/atendimento/atendimento.js');
                    });
                }

                const atualizaBancoDeDados = () => {
                    mysql.query(`UPDATE atendimento_anexo SET arquivo = ?, tamanho = ?, estagio = 'f', dt_storage = NOW() WHERE id = ? AND atendimento_id = ? AND empresa_id = ?`, 
                    [ nomeArquivo, dados.size, dados.anexoID, dados.atendimentoID, this.empresaID ], ( erro, result ) => {
                        if ( erro || !result ) return trataErro('Erro ao registrar anexo');
                        if ( result.affectedRows <= 0 ) {
                            return trataErro('Erro ao enviar imagem');
                        }
                        resolve();
                        evento.emit('atendimento.anexoEnviado', this.empresaID, this.usuario.id, dados.atendimentoID, dados.anexoID );
                    });
                }



                // verifica se o anexo ainda existe no banco, ou seja, se o mesmo não foi excluído pelo usuário
                mysql.query(`SELECT id FROM atendimento_anexo WHERE id = ? AND atendimento_id = ? AND empresa_id = ?`,
                [ dados.anexoID, dados.atendimentoID, this.empresaID ], (err, result ) => {
                    if ( err ) return trataErro('Erro ao registrar anexo');
                    if ( !result ) return atualizaBancoDeDados();
                    if ( result.length === 0 ) return trataErro('O Anexo não existe mais');
                    atualizaBancoDeDados();
                });
            });
        }


        /**
         * Aualiza o nome e a descrição de um anexo
         * REGRA
         * - se o anexo foi adicionado antes do atendimento ter sido concluído, o atendimento deve está com status 4
         * - se o anexo foi adicionado depois do atendiment ter sico concluído, o atendimento deve está com status 5
         */
        atualizaNomeDescricaoAnexo ( dados ) {
            return new Promise( ( resolve, reject ) => {
                let value, descricao;

                let valida = (callback) => {
                    validacao.validaAtualizaNomeDescricaoAnexo ( this.usuario, dados )
                    .then( _value => {
                        value = _value;
                        descricao = value.descricao || null;
                        callback();
                    })
                    .catch( erro => {
                        callback( erro );
                    });
                };

                let atualizaDB = (callback) => {
                    let where = 'empresa_id = ? AND atendimento_id = ? AND id_local = ?';
                    let cols = [ value.nome, descricao, this.usuario.empresa_id, value.atendimentoID, value.anexoIdLocal ];
    
                    if( value.anexoID && _.isNumber( value.anexoID ) ) {
                        where += ' AND id = ?';
                        cols.push( value.anexoID );
                    }

                    mysql.query(`UPDATE atendimento_anexo SET nome = ?, descricao = ? WHERE ${where}`, cols, 
                    ( erro, result ) => {
                        if ( erro || !result ) return callback('Erro ao atualizar dados');
                        callback();
                    });
                };

                // processa
                async.series([
                    valida, atualizaDB
                ], (erro) => {
                    if( erro ) return reject( erro );
                    resolve();
                    evento.emit('atendimento.anexoAtualizado', this.empresaID, this.usuario.id, value.atendimentoID, value.anexoID, value.nome, descricao );
                });
                // fim processa

            });
        }

        /**
         * Remove um anexo do prontuário
         * 
         * - remover do storage (se já tiver sido enviado)
         * - remover registro do DB
         * 
         * CHECAR
         * - se o arquivo existe
         * - se pertence ao atendimento e ao profissional
         * - o atendimento deve está com o status 'em atendimento' (4)
         */
        removeAnexo ( atendimentoID, anexoIdLocal, anexoID ) {
            return new Promise ( ( resolve, reject ) => {
                let data, conexao;

                const Valida = ( callback ) => {
                    validacao.validaAnexosGenerico( this.usuario, atendimentoID, anexoIdLocal, anexoID )
                    .then(( _data) =>{
                        data = _data;
                        callback( );
                    }).catch((erro)=> {
                        callback( erro );
                    });
                };

                let Transaction = (callback) => {
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

                const RemoveRegistroDB = ( callback ) => {
                    let where = 'empresa_id = ? AND atendimento_id = ? AND id_local = ?';
                    let cols = [ this.empresaID, atendimentoID, anexoIdLocal ];

                    if( anexoID && _.isNumber( anexoID ) ) {
                        where += ' AND id = ?';
                        cols.push( anexoID );
                    }

                    conexao.query(`DELETE FROM atendimento_anexo WHERE ${where}`, cols, ( err, result ) => {
                        if ( err || !result ) return callback ( 'Erro interno ao remover anexo' );
                        if( result.affectedRows != 1 ) return callback('Erro interno ao remover anexo');
                        callback();
                    });
                };

                /**
                 * Remove o arquivo do google storage. Se o estágio do anexo for diferente
                 * de finalizado (f), não há arquivo no storage e por tanto não há o que fazer
                 */
                const RemoveArquivoDoStorage = ( callback ) => {
                    if ( data.estagioAnexo !== 'f' ) return callback();
                    if ( !data.arquivo ) return callback('Provavelmente o arquivo ainda está sendo enviado');

                    let pastaRemota = storage.getPastaProntuario( this.empresaID, this.usuario.id );

                    storage.deletaArquivo( `${pastaRemota}/${data.arquivo}` )
                    .then( () => {
                        callback();
                    })
                    .catch( erro => {
                        /**
                         * Quando o arquivo nã existe no Storage, não gera um erro, apenas deve 
                         * remover o registro do DB
                         */
                        if( erro.code === 404 ) {
                            return callback();
                        }
                        callback('Erro interno ao remover anexo');


                        let msg = `Falha ao remover anexo do prontuário
Código de erro: ${erro.code}
Arquivo: ${pastaRemota}/${data.arquivo}
ID da empresa: ${this.empresaID}`;
                        log.registraErro( msg, 'arquivo,storage', 'Arquivo: src/controller/atendimento/atendimento.js');
                    });
                };

                // processa
                async.series([
                    Valida,
                    Transaction,
                    RemoveRegistroDB,
                    RemoveArquivoDoStorage
                ],
                (err, result) => {
                    // aqui será feito o comit ou rollback
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback( () => {conexao.release();});
                    }else{
                        conexao.commit( err => {
                            if(err) {
                                reject('Erro interno');
                                conexao.rollback( () => {conexao.release();});
                            }else {
                                resolve();
                                conexao.release();
                                evento.emit('atendimento.anexoExcluido', this.empresaID, this.usuario.id, atendimentoID, anexoID );
                            }
                        });
                    }
                });
                // fim processa


            });
        }

        /**
         * Retorna os anexos do atendimento com status 'em atendimento' (4) OU 'atendimento concluído' (5)
         * Se o atendimento tiver sido concluído, apenas anexos anviados depois do atendimento concluído deve ser retornado
         * 
         * CÓDIGOS DE ERRO
         * 1 = só profissional pode acessar
         * 2 = o atendimento não existe ou não está com status 4 ou não pertence ao profissional
         * 3 = erro interno ao buscar dados
         * 
         * RETORNO
         * array com os arquivos (apenas dados, os arquivos mesmos serão requisitdos via HTTP)
         */
        getAnexosDoAtendimentoEmAndamento ( atendimentoID ) {
            atendimentoID = parseInt( atendimentoID );
            return new Promise ( ( resolve, reject ) => {
                if ( this.usuario.perfil != 'p' ) return callback(1);
                let statusAtendimento;

                const buscaDados = ( ) => {
                    let where = 'empresa_id = ? AND atendimento_id = ?';
                    let col = [ this.empresaID, atendimentoID ];

                    if( statusAtendimento == 5 ) {
                        where += ' AND atm_concluido = ?';
                        col.push('s');
                    }

                    mysql.query(`SELECT id, id_local, tipo, nome, descricao, arquivo, miniatura, estagio, erro, dt_cadastro, atm_concluido, atendimento_id AS atendimentoID  
                    FROM atendimento_anexo 
                    WHERE ${where}`, col, ( err, result ) => {
                        if ( err || !result ) return reject(3);
                        resolve( result );
                    });
                };

                mysql.query(`SELECT status FROM atendimento WHERE empresa_id = ? AND profissional_id = ? AND id = ? AND status IN ('4', '5')`, 
                [ this.empresaID, this.usuario.profissional_id, atendimentoID ], ( err, result ) => {
                    if ( err || !result ) return reject(3);
                    if ( result.length === 0 ) return resolve([]);
                    statusAtendimento = result[0].status;
                    buscaDados();
                });

            });
        }

        /**
         * Retorna 1 anexo, desde que o atendimento esteja com status 'em atendimento' (4) ou 'atendido' (5)
         */
        getAnexo ( atendimentoID, anexoID ) {
            atendimentoID = parseInt( atendimentoID );
            anexoID = parseInt( anexoID );

            return new Promise ( ( resolve, reject ) => {
                if ( this.usuario.perfil != 'p' ) return callback(1);
                let statusAtendimento;

                const buscaDados = ( ) => {
                    let where = 'empresa_id = ? AND atendimento_id = ? AND id = ?';
                    let col = [ this.empresaID, atendimentoID, anexoID ];

                    if( statusAtendimento == 5 ) {
                        where += ' AND atm_concluido = ?';
                        col.push('s');
                    }

                    mysql.query(`SELECT id, id_local, tipo, nome, descricao, arquivo, miniatura, estagio, erro, dt_cadastro, atm_concluido, atendimento_id AS atendimentoID  
                    FROM atendimento_anexo 
                    WHERE ${where} LIMIT 1`, col, ( err, result ) => {
                        if ( err || !result ) return reject(3);
                        resolve( result[0] );
                    });
                };

                mysql.query(`SELECT status FROM atendimento WHERE empresa_id = ? AND profissional_id = ? AND id = ? AND status IN ('4', '5')`, 
                [ this.empresaID, this.usuario.profissional_id, atendimentoID ], ( err, result ) => {
                    if ( err || !result ) return reject(3);
                    if ( result.length === 0 ) return reject(1);
                    statusAtendimento = result[0].status;
                    buscaDados();
                });

            });
        }
    } // fim classe

    module.exports = Atendimento;
}