/* jshint -W030 */
{ 
    "use strict";

    /**
     * Gerencia a assinatura das empresas
     */

    const 
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore'),
        faturaValidacao = require('./fatura-validacao'),
        constants = require('src/util/constant.js'),
        evento = require('src/eventos/eventosInternos'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil,
        EnviaEmailEmpresa = require("src/admin/enviaEmail.js").EnviaEmail,
        moment = require('moment'),
        async = require('async');

    class AdminFatura {
        constructor( ) {
            /**
             * Quantidade de dias que uma fatura deve ser bloqueada depois de vencida
             */
            this.prazoBloqueiFatura = constants.assinatura.prazoBloqueiFatura;
        }

        /**
         * Retorna as faturas de uma assinatura específica
         * @param {int} empresaID PK empresa
         * @param {int} assinaturaID PK assinatura
         */
        getFaturasDaAssinatura( empresaID, assinaturaID ) {
            return new Promise( ( resolve, reject ) => {
                mysql.query(`SELECT * FROM v_fatura WHERE empresa_id = ? AND assinatura_id = ? ORDER BY id DESC`, [ empresaID, assinaturaID ], (erro, result) => {
                    if( erro || !result ) return reject( 'Erro interno ao baixar faturas' ); 
                    resolve( result );

                    //TODO: retornar também a lista de pagamentos que cada assinatura tem OU buscar posteriormente
                    // TODO: retornar também a lista de itens da fatura (demonstrativo)
                });
            });
        }

        // Igual a getFaturasDaAssinatura, porém retorna apeas 1 fatura
        getFatura( faturaID ) {
            return new Promise( ( resolve, reject ) => {
                mysql.query(`SELECT * FROM v_fatura WHERE id = ? LIMIT 1`, [ faturaID ], (erro, result) => {
                    if( erro || !result ) return reject( 'Erro interno ao baixar fatura' ); 
                    if( result.length === 0 ) return reject('Fatura não encontrada');
                    resolve( result[0] );
                });
            });
        }

        /**
         * Atualiza a observação interna sobre a fatura
         * 
         * @param {int} faturaID PK da empresa
         * @param {string|null} obs observação
         */
        editNota( faturaID, obs ) {
            return new Promise( ( resolve, reject ) => {
                if( !_.isString( obs )) obs = null;
                if( !obs ) obs = null;

                mysql.query(`UPDATE fatura SET obs_interna = ? WHERE id = ?`, [ obs, faturaID ], (err, result ) => {
                    if( err || !result ) return reject('erro interno ao atualizar dados');
                    if( result.affectedRows == 0 ) return reject('Não foi possível atualizar os dados');
                    resolve();
                });
            });
        }

        /**
         * Altera "a revelia" o status de uma fatura
         */
        alteraStatus( dados ) {
            return new Promise( ( resolve, reject ) => {
                let data, conexao, novoStatusID,
                assinaturaDesbloqueada = false,
                novoStatusAssinatura;

                const Valida = ( callback ) =>  {
                    faturaValidacao.validaMudancaStatusFatura( dados )
                    .then( value => {
                        data = value;
                        callback();
                    })
                    .catch( erro => callback(erro) );
                };

                // Verifica se a fatura existe
                const Transaction = (callback) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection)=> {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction((err) => {
                            if (err) { return callback('erro interno');}
                            callback();
                        });
                    });
                };

                const AtualizaStatusFatura = ( callback ) => {
                    if( !conexao ) return callback('A transção não foi iniciada');

                    let novoStatus = {
                        assinatura_id: data.dados.assinatura_id,
                        fatura_id: data.dados.fatura_id,
                        status: data.dados.status
                    };
                    if( data.dados.obs_interna ) novoStatus.obs_interna = data.dados.obs_interna;

                    conexao.query('INSERT INTO fatura_status SET ?', [ novoStatus ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro ao alterar status');
                        if( !result.insertId ) return callback('Erro ao alterar status');
                        novoStatusID = result.insertId;
                        callback();
                    });
                };

                /**
                 * Desbloqueia o plano de assinatura da empresa
                 * 
                 * REGRA
                 * A mesma deve esta INATIVA e o operador marcou o checkbox 
                 * "ATIVAR EMPRESA"
                 */
                const DesbloqueiaAssinatura = ( callback ) => {
                    if( !data.dados.ativa_conta ) return callback();
                
                    conexao.query(`SELECT count(*) AS total FROM v_assinatura WHERE id = ? AND status = '4'`, 
                    [ data.dados.assinatura_id ], (err, result) => {
                        if( err || !result ) return callback('erro interno');
                        if( result.length == 0 ) return callback();
                        if( result[0].total == 0 ) return callback();
                        
                        // desbloqueia a fatura
                        novoStatusAssinatura = '2';
                        let obs = `Desbloqueio na mudança manual de status (${novoStatusID}) da fatura ${data.dados.fatura_id}`;
                        conexao.query(`INSERT INTO assinatura_status ( empresa_id, assinatura_id, obs_interna, status ) VALUES (?)`, [ [data.info.empresa_id, data.dados.assinatura_id, obs, novoStatusAssinatura] ], ( erro, result ) => {
                            if( erro || !result ) return callback('Erro interno: SA-1');
                            if( !result.insertId ) return callback('Erro interno: SA-2');
                            
                            assinaturaDesbloqueada = true;
                            callback();
                        });
                    });
                };

                const NotificaCliente = ( ) => {
                    if( assinaturaDesbloqueada ) {
                        evento.emit('assinatura.statusAlterado', data.info.empresa_id, data.dados.assinatura_id, novoStatusAssinatura );
                    }
                    evento.emit('fatura.statusAlterado', data.info.empresa_id, data.dados.assinatura_id, data.dados.fatura_id, data.dados.status );
                    
                    if( data.dados.enviaEmailAoCliente != true ) {return; }

                    let faturaImpressao = {
                        faturaID: data.info.id,
                        link: data.info.link_pg,
                        dataEmissao: moment(data.info.dt_gerado).format('DD/MM/YYYY'),
                        vencimento: moment(data.info.dt_vencimento).format('DD/MM/YYYY'),
                        periodo: moment(data.info.dt_inicio).format('DD/MM/YYYY') + ' à ' + moment(data.info.dt_fim).format('DD/MM/YYYY'),
                        valorFatura: this.currencyFormat( data.info.valor )
                    };

                    // pega os dados da assinatura
                    mysql.query(`SELECT nome, email, status FROM v_assinatura WHERE id = ?`, [ data.info.assinatura_id ], (err, res) => {
                        if( err || !res ) return;

                        // Envia e-mail sobre a conta desbloqueada
                        if( assinaturaDesbloqueada ) {
                            EnviaEmailEmpresa.assinaturaDesbloqueada( res[0].email, res[0].nome );
                        }

                        // Envia e-mail alteração de status da FATURA
                        let mensagemParaEnviar = null;
                        let faturaStatus;

                        switch ( data.dados.status ) {
                            case "cr":
                                mensagemParaEnviar = 'faturaStatusAlterado';
                                faturaStatus = 'Criado';
                                break;
                            case "pt":
                                mensagemParaEnviar = 'faturaStatusAlterado';
                                faturaStatus = 'Pago';
                                break;
                            case "pp":
                                mensagemParaEnviar = 'faturaStatusAlterado';
                                faturaStatus = 'Pagamento parcial';
                                break;
                            case "at":
                                mensagemParaEnviar = 'faturaAtrasa';
                                break;
                            case "pe":
                                mensagemParaEnviar = 'faturaPerdoada';
                                break;
                            case "ca":
                                mensagemParaEnviar = 'faturaCancelada';
                                break;
                            case "np":
                                mensagemParaEnviar = 'faturaInadimplente';
                                break;
                        }

                        if( !mensagemParaEnviar ) return; // se não for nenhum dos status definidos acima, não envia

                        if( mensagemParaEnviar == 'faturaStatusAlterado' ) {
                            faturaImpressao.faturaStatus = faturaStatus;
                            EnviaEmailEmpresa.faturaStatusAlterado( res[0].email, res[0].nome, faturaImpressao );
                            return;
                        }

                        let statusServico = '';
                        switch ( res[0].status ) {
                            case "1":
                            case "2":
                                statusServico = 'Ativo';
                                break;
                            case "3":
                                statusServico = 'Em atraso';
                                break;
                            case "4":
                                statusServico = 'Bloqueado';
                                break;
                            case "5":
                            case "6":
                                statusServico = 'Cancelado';
                                break;
                        }

                        EnviaEmailEmpresa[mensagemParaEnviar]( res[0].email, res[0].nome, faturaImpressao, statusServico );
                    });

                };

                // processa
                async.series([
                    Valida, Transaction, AtualizaStatusFatura, DesbloqueiaAssinatura
                ], (err, result) => {
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(() => conexao.release() );
                    }else{
                        conexao.commit((err)=> {
                            if(err) {
                                conexao.rollback(()=> conexao.release() );
                                reject('Erro interno no commit');
                            }else {
                                conexao.release();
                                resolve();
                                NotificaCliente();
                                assinaturaUtil.limpaCacheAssinatura( data.info.empresa_id );
                            }
                        });
                    }
                });

            });
        }

        /**
         * Registra um pagamento de uma fatura
         * @param {object} _dados dados do pagamento
         * @param {boolean} enviaEmailAoCliente se deve enviar e-mail ao cliente informando da confirmação de pagamento
         * @param {boolean} ignorarStatusFatura se deve registrar o pagamento mesmo se a fatura já tiver sido paga
         */
        registraPagamento( _dados, enviaEmailAoCliente, ignorarStatusFatura ) {
            return new Promise( (resolve, reject ) => {
                let 
                dados, 
                conexao,
                pagamentoID,
                assinaturaDesbloqueada = false,
                atualizouStatus = false,
                novoStatusAssinatura,
                novoStatusFatura;

                // tarefas do 1º Ciclo

                const Valida = ( callback ) =>  {
                    faturaValidacao.validaFaturaPagamento( _dados, ignorarStatusFatura )
                    .then( value => {
                        dados = value;
                        callback();
                    })
                    .catch( erro => callback(erro) );
                };

                const Transaction = (callback) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection)=> {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction((err) => {
                            if (err) { return callback('erro interno');}
                            callback();
                        });
                    });
                };

                // Tarefas do 2º Clico
                
                const RegistraPagamento = ( callback ) => {
                    if( !conexao ) return callback('A transção não foi iniciada');
                    if( dados.pagamento.forma_pg_interna == null) delete dados.pagamento.forma_pg_interna;
                    if( dados.pagamento.comprovante == null) delete dados.pagamento.comprovante;
                    

                    conexao.query('INSERT INTO fatura_pagamento SET ?', [dados.pagamento], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno ao registrar pagamento');
                        if( !result.insertId ) return callback('Erro ao registrar pagamento');
                        pagamentoID = result.insertId;
                        callback();
                    });
                };
                
                /**
                 * Atualiza o status da fatura
                 */
                const AtualizaStatusFatura = ( callback ) => {
                    let valorRecebido = dados.pagamento.valor + ( dados.info.valor_recebido ? dados.info.valor_recebido : 0 );
                    let totalFatura = dados.info.valor + ( dados.info.custo_cobranca ? dados.info.custo_cobranca : 0 );
                    novoStatusFatura = valorRecebido >= totalFatura ? 'pt' : 'pp';

                    if( dados.info.status == novoStatusFatura ) { return callback(); }// Não há o que atualizar
                    
                    conexao.query('INSERT INTO fatura_status ( status, fatura_id, assinatura_id ) VALUES (?)', [ [novoStatusFatura, dados.pagamento.fatura_id, dados.pagamento.assinatura_id] ], ( erro, result) => {
                        if( erro || !result ) return callback('Erro interno: SF-1');
                        if( !result.insertId ) return callback('Erro interno: SF-2');
                        atualizouStatus = true;
                        callback();
                    });
                };
                
                /**
                 * Desbloqueia a ASSINATURA, caso o pagamento tenha sido feito TOTALMENTE
                 * E se não houver outra fatura pendente na mesma assinatura
                 */
                const DesbloqueiaAssinatura = ( callback ) => {
                    if( novoStatusFatura != 'pt' ) { return callback(); }// só desbloqueia se o pagamento for total
                    /**
                     * REGRA
                     * Localizar assinatura com status bloqueado (4)
                     * Não encontrar resultados no JOIN v_fatura
                     * 
                     * RESUMO: se não encontrar resultado, naõ desbloqueia
                     */
                    conexao.query(`SELECT a.id AS id_ass, f.id AS id_fatura
                    FROM v_assinatura a 
                    LEFT JOIN v_fatura f ON (
                        f.assinatura_id = a.id AND f.id != ? AND 
                        (
                            ( DATE_ADD(f.dt_vencimento, INTERVAL ? DAY) < NOW() AND f.status = 'pp' ) OR
                            ( f.status = 'np' )
                        ) 
                    )
                    WHERE a.id = ? AND a.status = '4' 
                    HAVING id_fatura IS NULL`, 
                    [ dados.pagamento.fatura_id, this.prazoBloqueiFatura, dados.pagamento.assinatura_id ], (err, result) => {
                        if( err || !result ) return callback('erro interno do servidor');
                        if( result.length == 0 ) return callback();
                        
                        // desbloqueia a fatura
                        novoStatusAssinatura = '2';
                        let obs = `Desbloqueio automático ao receber R$ ${dados.pagamento.valor} da fatura ${dados.pagamento.fatura_id}`;
                        conexao.query(`INSERT INTO assinatura_status ( empresa_id, assinatura_id, obs_interna, status ) VALUES (?)`, [ [dados.info.empresa_id, dados.pagamento.assinatura_id, obs, novoStatusAssinatura] ], ( erro, result ) => {
                            if( erro || !result ) return callback('Erro interno: SA-1');
                            if( !result.insertId ) return callback('Erro interno: SA-2');

                            assinaturaDesbloqueada = true;
                            callback();
                        });
                    });
                };
                
                // várias tarefas que podem ser realizadas em paralelo, logo depois da validação
                const ProcessaSegundoCiclo = ( callback ) => {
                    async.parallel([
                        RegistraPagamento, AtualizaStatusFatura
                    ], (err, result) => {
                        if (err) return callback(err);
                        callback();
                    });
                };

                // TAREFAS que só podem ser executadas depois do 2º ciclo

                const NotificaCliente = ( ) => {
                    if( assinaturaDesbloqueada ) {
                        evento.emit('assinatura.statusAlterado', dados.info.empresa_id, dados.pagamento.assinatura_id, novoStatusAssinatura );
                    }
                    evento.emit('fatura.statusAlterado', dados.info.empresa_id, dados.pagamento.assinatura_id, dados.pagamento.fatura_id, novoStatusFatura );
                    
                    if( enviaEmailAoCliente != true ) { return; }

                    // pega os dados da assinatura
                    mysql.query(`SELECT nome, email, status FROM v_assinatura WHERE id = ?`, [dados.pagamento.assinatura_id], (err, res) => {
                        if( err || !res ) return;

                        // se a fatura tiver sido desbloqueada
                        if( assinaturaDesbloqueada ) {
                            EnviaEmailEmpresa.assinaturaDesbloqueada( res[0].email, res[0].nome );
                        }

                        let valorFatura = this.currencyFormat( dados.info.valor );
                        let valorRecebido = this.currencyFormat( dados.pagamento.valor );
                        let valorRecebidoAnteriormente = null;
                        if( dados.info.valor_recebido ) {
                            valorRecebidoAnteriormente = this.currencyFormat( dados.info.valor_recebido );
                        }

                        let faturaImpressao = {
                            link: dados.info.link_pg,
                            faturaID: dados.pagamento.fatura_id,
                            dataPg: moment(dados.pagamento.dt_pagamento).format('DD/MM/YYYY'),
                            vencimento: moment(dados.info.dt_vencimento).format('DD/MM/YYYY'),
                            periodo: moment(dados.info.dt_inicio).format('DD/MM/YYYY') + ' à ' + moment(dados.info.dt_fim).format('DD/MM/YYYY'),
                            valorFatura: valorFatura,
                            valorRecebido: valorRecebido,
                            valorRecebidoAnteriormente: valorRecebidoAnteriormente
                        };

                        
                        // PAGAMENTO TOTAL
                        if( novoStatusFatura == 'pt' ) {
                            EnviaEmailEmpresa.faturaPagaTotal( res[0].email, res[0].nome, faturaImpressao );

                        } else if( novoStatusFatura == 'pp' ) { // pagamento PARCIAL

                            let valorRecebido = dados.pagamento.valor + ( dados.info.valor_recebido ? dados.info.valor_recebido : 0 );
                            let totalFatura = dados.info.valor + ( dados.info.custo_cobranca ? dados.info.custo_cobranca : 0 );
                            faturaImpressao.saldoDevedor = this.currencyFormat( totalFatura - valorRecebido );

                            EnviaEmailEmpresa.faturaPagaParcial( res[0].email, res[0].nome, faturaImpressao, res[0].status );
                        }
                    });
                    
                };

                
                async.series([
                    Valida, Transaction, ProcessaSegundoCiclo, DesbloqueiaAssinatura
                ], (err, result) => {
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(() => conexao.release() );
                    }else{
                        conexao.commit((err)=> {
                            if(err) {
                                conexao.rollback(()=> conexao.release() );
                                reject('Erro interno no commit');
                            }else {
                                conexao.release();
                                resolve({id: pagamentoID, status: novoStatusFatura });
                                NotificaCliente();
                                assinaturaUtil.limpaCacheAssinatura( dados.info.empresa_id );
                            }
                        });
                    }
                });// async
            });
        }


        /**
         * Retorna os profissionais que devem ser cobrados, ou seja, os profissionais
         * que estiveram ativos nesse período (apenas os que foram selecionados 
         * na assinatura, ou todos, se todos tiver sido marcado no ato da assinatura)
         * 
         * @param {int} assinaturaID PK da assinatura
         * @param {date} dataIncio data do inicio do período de cobrança
         * @param {date} dataFim data final do período de cobrança
         */
        getProfissionaisFaturados( assinaturaID, dataIncio, dataFim ) {
            return new Promise( ( resolve, reject ) => {

                mysql.query(`SELECT * FROM v_assinatura_profissionais
                WHERE assinatura_id = ? AND dt_entrada >= ? AND dt_final <= ?
                GROUP BY profissional_id
                `, [ assinaturaID, dataIncio, dataFim ], ( erro, result ) => {
                    if( erro || !result ) return reject('Erro ao baixar profissionais a faturar');
                    if( result.length == 0 ) return resolve([]);
                    resolve( result );
                });
            });
        }


        /**
         * Cria uma fatura para uma assinatura específica.
         * Não é necessário que a assinatura esteja ativa para gerar a fatura, já que
         * pode esta gerando a fatura residual após o cancelamento da assinatura
         */
        criaFatura( dados ) {
            return new Promise( ( resolve, reject ) => {
                let data, 
                conexao,
                faturaID;

                const Valida = ( callback ) =>  {
                    faturaValidacao.validaCriarFatura( dados )
                    .then( value => {
                        data = value;
                        callback();
                    })
                    .catch( erro => callback(erro) );
                };

                const Transaction = (callback) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection)=> {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction((err) => {
                            if (err) { return callback('erro interno');}
                            callback();
                        });
                    });
                };

                const registraFatura = ( callback ) => {
                    let insert = {
                        empresa_id: data.empresa_id,
                        assinatura_id: data.assinatura_id,
                        dt_inicio: data.dt_inicio,
                        dt_fim: data.dt_fim,
                        dt_vencimento: data.dt_vencimento
                    };

                    if( data.custo_cobranca ) insert.custo_cobranca = data.custo_cobranca;
                    if( data.link_pg )        insert.link_pg = data.link_pg;
                    if( data.obs_interna )    insert.obs_interna = data.obs_interna;

                    conexao.query(`INSERT INTO fatura SET ?`, [ insert ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno - FA-1');
                        if( !result.insertId ) return callback('Erro interno - FA-2');
                        faturaID = result.insertId;
                        callback();
                    });
                };

                const registraItens = ( callback ) => {
                    let itens = [];

                    let desc;
                    for (const item of data.itens ) {
                        desc = item.descricao;
                        if( item.complemento ) desc += ' - ' + item.complemento;

                        itens.push( [ data.assinatura_id, faturaID, desc, item.valor ] );
                    }

                    conexao.query(`INSERT INTO fatura_item ( assinatura_id, fatura_id, descricao, valor ) VALUES ?`, [ itens ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno - ITM-1');
                        if( !result.insertId ) return callback('Erro interno - ITM-2');
                        callback();
                    });
                };

                const registraStatus = ( callback ) => {
                    let insert = {
                        assinatura_id: data.assinatura_id,
                        fatura_id: faturaID,
                        status: data.status
                    };
                    conexao.query(`INSERT INTO fatura_status SET ?`, [ insert ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno - ST-1');
                        if( !result.insertId ) return callback('Erro interno - ST-2');
                        callback();
                    });
                };

                // várias tarefas que podem ser realizadas em paralelo, logo depois da validação
                const ProcessaSegundoCiclo = ( callback ) => {
                    async.parallel([
                        registraItens, registraStatus
                    ], (err, result) => {
                        if (err) return callback(err);
                        callback();
                    });
                };

                const NotificaCliente = ( ) => {
                    if( data.enviaEmailAoCliente != true ) { return; }
                    // não envia e-mail se a fatura tiver com o status Perdoado, Cancelado ou Pago totalmente
                    if( data.status == 'pe' || data.status == 'ca' || data.status == 'pt' ) { return; }

                    let valor = this.somaValorItensDaFatura( data.itens );
                    valor = this.currencyFormat( valor );

                    let faturaImpressao = {
                        link: data.link_pg,
                        data: moment().format('DD/MM/YYYY'),
                        vencimento: moment(data.dt_vencimento).format('DD/MM/YYYY'),
                        periodo: moment(data.dt_inicio).format('DD/MM/YYYY') + ' à ' + moment(data.dt_fim).format('DD/MM/YYYY'),
                        valor: valor
                    };
                    EnviaEmailEmpresa.faturaGerada( data.email, data.nome, faturaImpressao );
                };
                
                async.series([
                    Valida, Transaction, registraFatura, ProcessaSegundoCiclo
                ], (err, result) => {
                    if(err) {
                        reject(err);
                        if( conexao ) conexao.rollback(() => conexao.release() );
                    }else{
                        conexao.commit((err)=> {
                            if(err) {
                                conexao.rollback(()=> conexao.release() );
                                reject('Erro interno no commit');
                            }else {
                                conexao.release();
                                resolve({id: faturaID});

                                NotificaCliente();
                                evento.emit('fatura.criada',  data.empresa_id, data.assinatura_id, faturaID );
                            }
                        });
                    }
                });// async
            });
        }

        currencyFormat(num) {
            if( !num ) return;
            return (
                num
                .toFixed(2) // 2 casas decimais
                .replace('.', ',')
                .replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
            );
        }

        somaValorItensDaFatura ( itens ) {
            const reducerValor = (total, item) => total + item.valor;
            return itens.reduce( reducerValor, 0 );
        }

    } // fim classe

    module.exports = new AdminFatura();
}