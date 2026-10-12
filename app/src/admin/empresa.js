/* jshint -W030 */
{ 
    "use strict";

    /**
     * Basicamente trata das empresas
     */

    const 
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore'),
        async = require('async');

    class AdminEmpresas {
        constructor( ) {
            this.empresasPorPagina = 50;
        }

        /**
         * Retona empresas de acordo com critérios de busca
         */
        _buscaEmpresas ( _where, pagina, limit ) {
            return new Promise( ( resolve, reject ) => {
                let t = this._getWhereEmpresas( _where );
                pagina = Math.max(1, pagina || 0);
                if(pagina > 0) pagina--;
                pagina = Number(pagina * limit);

                const where = t.where ? `WHERE ${t.where}` : '';
                const select = `SELECT * FROM v_adm_empresa ${where} ORDER BY id DESC, plano DESC LIMIT ${pagina}, ${limit}`;
                mysql.query( select, t.find, (erro, result ) => {
                    if( erro || !result ) return reject('Erro ao buscar empresas');
                    resolve( result );
                });
            });
        }

        buscaEmpresas ( _where, pagina ) {
            return this._buscaEmpresas ( _where, pagina, this.empresasPorPagina );
        }

        buscaEmpresaByID ( empresaID ) {
            return new Promise( (resolve, reject ) => {
                this._buscaEmpresas ( {id: empresaID}, 1, 1 )
                .then( result => {
                    resolve(result[0]);
                })
                .catch( erro => reject(erro) );
            });
        }

        buscaTotalEmpresas( _where ) {
            let t = this._getWhereEmpresas( _where );
            const where = t.where ? `WHERE ${t.where}` : '';

            return new Promise( ( resolve, reject ) => {
                const select = `SELECT count(*) AS total FROM v_adm_empresa ${where}`;
                mysql.query(select, t.find, (err, result) => {
                    if( err || !result ) return reject('Erro ao buscar o total de empresas');
                    if( result.length == 0 ) return resolve(0);
                    resolve(result[0].total);
                });
            });
        }

        /**
         * Retorna os detalhes adicionais da empresa, exceto faturas
         * 
         * Dados de retorno
         * - profissionais
         * - serviços
         * - total de clientes
         * - resumo de atendimentos (agendado | atendendo e atendido)
         */
        getDetalhesEmpresa( empresaID ) {
            return new Promise( ( resolve, reject ) => {
                /**
                 * Lista os profissionais, seus atendimentos realizados nos 
                 * últimos 30 dias e os acessos que o profissional fez nos
                 * últimos 30 dias
                 */
                const Profissionais = ( callback ) => {
                    mysql.query(`SELECT id, nome, ativo, demo, conselho, conselho_uf, conselho_nr, tratamento, especialidade,
                    (SELECT COUNT(*) FROM atendimento WHERE profissional_id = p.id AND status = '5' AND TIMESTAMPDIFF(DAY, dt_servico, NOW()) < 30 ) AS atendimentos, 
                    (SELECT COUNT(*) FROM usuario_sessao WHERE usuario_id = p.usuario_id AND TIMESTAMPDIFF(DAY, dt_inicio, NOW()) < 30 ) AS acessos 
                    FROM profissional p 
                    WHERE empresa_id = ?
                    `, [ empresaID ], (err, result) => {
                        if( err || !result ) return callback();
                        callback( null, result );
                    });
                };
                
                const Servicos = ( callback ) => {
                    mysql.query(`SELECT nome, valor, tempo, ativo, (SELECT COUNT(*) FROM atendimento WHERE servico_id = s.id ) AS atendimentos FROM servico s WHERE empresa_id = ?`, [ empresaID ], (err, result) => {
                        if( err || !result ) return callback();
                        callback( null, result );
                    });
                };

                const Clientes = ( callback ) => {
                    mysql.query(`SELECT COUNT(*) AS total FROM cliente WHERE empresa_id = ?`, [ empresaID ], (err, result) => {
                        if( err || !result ) return callback();
                        if( result.length == 0 ) return callback( );
                        callback( null, result[0].total );
                    });
                };

                const Atendimentos = ( callback ) => {
                    let atms = {
                        total: null, // total todo o período
                        cancelado: null, // todo o perído
                        atendido: null, // atendendo ou atendidos - todo o período
                        atendidoMes: null // atendidos nos ultimos 30 dias
                    };
                    let tarefas = 0;
                    
                    // Total
                    mysql.query(`SELECT COUNT(*) AS total FROM atendimento WHERE empresa_id = ?`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            atms.total = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, atms );
                    });

                    // cancelado e faltou
                    mysql.query(`SELECT COUNT(*) AS total FROM atendimento WHERE empresa_id = ? AND status IN ('6', '7')`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            atms.cancelado = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, atms );
                    });

                    // atendendo ou atendido
                    mysql.query(`SELECT COUNT(*) AS total FROM atendimento WHERE empresa_id = ? AND status IN ('4', '5')`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            atms.atendido = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, atms );
                    });

                    // atendidos nos últimos 30 dias
                    mysql.query(`SELECT COUNT(*) AS total FROM atendimento WHERE empresa_id = ? AND status = '5' AND TIMESTAMPDIFF(DAY, dt_servico, NOW()) < 30`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            atms.atendidoMes = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, atms );
                    });

                };

                const Pacientes = ( callback ) => {
                    let dados = {
                        total: null, // total
                        trintaDias: null // cadastrados nos últimos 30 dias
                    };
                    let tarefas = 0;
                    
                    // Total
                    mysql.query(`SELECT COUNT(*) AS total FROM cliente WHERE empresa_id = ?`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.total = result[0].total;
                        }
                        if( tarefas >= 2 ) callback( null, dados );
                    });

                    // cadastrado nos últimos 30 dias
                    mysql.query(`SELECT COUNT(*) AS total FROM cliente WHERE empresa_id = ? AND TIMESTAMPDIFF(DAY, dt_cadastro, NOW()) < 30`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.trintaDias = result[0].total;
                        }
                        if( tarefas >= 2 ) callback( null, dados );
                    });

                };

                /**
                 * Acessos dos clientes
                 */
                const Acessos = ( callback ) => {
                    let dados = {
                        ultimo: "",
                        sessentaDias: null,
                        trintaDias: null,
                        setDias: null,
                    };
                    let tarefas = 0;

                    // acessos nos últimos 60 dias
                    mysql.query(`SELECT COUNT(*) AS total FROM usuario_sessao WHERE empresa_id = ? AND TIMESTAMPDIFF(DAY, dt_inicio, NOW()) < 60`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.sessentaDias = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, dados );
                    });

                    // acessos nos últimos 30 dias
                    mysql.query(`SELECT COUNT(*) AS total FROM usuario_sessao WHERE empresa_id = ? AND TIMESTAMPDIFF(DAY, dt_inicio, NOW()) < 30`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.trintaDias = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, dados );
                    });

                    // acessos nos últimos 7 dias
                    mysql.query(`SELECT COUNT(*) AS total FROM usuario_sessao WHERE empresa_id = ? AND TIMESTAMPDIFF(DAY, dt_inicio, NOW()) < 7`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.setDias = result[0].total;
                        }
                        if( tarefas >= 4 ) callback( null, dados );
                    });

                    // último acesso
                    mysql.query(`SELECT dt_inicio FROM usuario_sessao WHERE empresa_id = ? ORDER BY id DESC LIMIT 1`, [ empresaID ], (err, result) => {
                        tarefas++;
                        if( result && result.length > 0 ) {
                            dados.ultimo = result[0].dt_inicio;
                        }
                        if( tarefas >= 4 ) callback( null, dados );
                    });

                };

                async.parallel({
                    profissional: Profissionais,
                    servico: Servicos,
                    cliente: Clientes,
                    atendimento: Atendimentos,
                    paciente: Pacientes,
                    acesso: Acessos
                }, (erro, result) => {
                    resolve(result);
                });
            });
        }

        editObservacaoEmpresa( empresaID, obs ) {
            return new Promise( ( resolve, reject ) => {
                if( !_.isString( obs )) obs = null;
                if( !obs ) obs = null;

                mysql.query(`UPDATE empresa SET obs_interna = ? WHERE id = ?`, [ obs, empresaID ], (err, result ) => {
                    if( err || !result ) return reject('erro interno ao atualizar dados');
                    if( result.affectedRows == 0 ) return reject('Não foi possível atualizar os dados');
                    resolve();
                });
            });
        }

        _getWhereEmpresas ( where ) {
            let _where = '';
            let find = [];

            if(where && _.isObject(where)) {
                if( _.has(where, 'text') && _.isString( where.text ) ) {
                    if( _where != '' ) _where += ' AND ';
                    _where += '(nome LIKE ? OR email LIKE ? OR telefone LIKE ? OR uf LIKE ? OR cidade LIKE ?)'; 
                    find.push('%' +where.text + '%', '%' +where.text + '%', '%' +where.text + '%', '%' +where.text + '%', '%' +where.text + '%');
                }

                if( _.has(where, 'aprovado') && _.isString( where.aprovado ) ) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'aprovado = ?'; 
                    find.push(where.aprovado);
                }

                if( _.has(where, 'ativo') && _.isString( where.ativo ) ) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'ativo = ?'; 
                    find.push(where.ativo);
                }

                if( _.has(where, 'plano') && _.isString( where.plano ) ) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'plano = ?'; 
                    find.push(where.plano);
                }

                if( _.has(where, 'plano_status') && _.isString( where.plano_status ) ) {
                    if( _where != '' ) _where += ' AND ';
                    _where += 'ass_status = ?'; 
                    find.push(where.plano_status);
                }

                if(_.has(where, 'data_cadastro') && _.isArray(where.data_cadastro)) {
                    if( where.data_cadastro.length === 2 ){
                        if( _where != '' ) _where += ' AND ';
                        _where += 'CAST(dt_cadastro AS date) BETWEEN ? AND ?';
                        find.push( [where.data_cadastro[0]], [where.data_cadastro[1]] );
                    }
                }

                if(_.has(where, 'data_assinatura') && _.isArray(where.data_assinatura)) {
                    if( where.data_assinatura.length === 2 ){
                        if( _where != '' ) _where += ' AND ';
                        _where += 'CAST(ass_data AS date) BETWEEN ? AND ?';
                        find.push( [where.data_assinatura[0]], [where.data_assinatura[1]] );
                    }
                }

                // se passar o ID, ignora todos os outros parametros
                if( _.has(where, 'id') && where.id != '') {
                    _where = 'id = ?';
                    find = [where.id];
                }
            }

            return {where: _where, find: find};
        } // getWhereEmpresas

    } // fim classe

    module.exports = new AdminEmpresas();
}