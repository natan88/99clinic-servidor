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
        evento = require('src/eventos/eventosInternos'),
        assinaturaUtil = require('src/controller/assinatura/assinatura-util').AssinaturaUtil,
        EnviaEmailEmpresa = require("src/admin/enviaEmail.js").EnviaEmail,
        moment = require('moment'),
        async = require('async');

    class AdminAssinatura {
        constructor( ) {
            
        }

        /**
         * Retorna informações completa sobre a assinatura vigente da empresa
         * Se a empresa não tiver assinatura vigente, informar código
         */
        getAssinaturaVigente( empresaID ) {
            return new Promise( ( resolve, reject ) => {
                const codigoErro = {
                    erroInterno: 1, // erro interno
                    semAssinatura: 2 // nao há assinatura do plano pró em vigor (não é um erro exatamente)
                };

                mysql.query(`SELECT a.*,
                (SELECT count(*) FROM profissional_faturar WHERE assinatura_id = a.id AND dt_saida IS NULL ) AS total_profissionais
                 FROM v_assinatura a WHERE a.empresa_id = ? ORDER BY a.id DESC LIMIT 1`, [ empresaID ], ( erro, result ) => {
                    if( erro || !result ) return reject( codigoErro.erroInterno ); 
                    if( result.length === 0 ) reject( codigoErro.semAssinatura );
                    resolve( result[0] );
                });
            });
        }

        /**
         * Altera o status de uma assinatura
         * 
         * No FUTURO: Ao cancelar a assinatura, checar se há débito residual, se houver,
         * gerar fatura pró-rata do período usado
         */
        alteraStatus( dados ) {
            return new Promise( ( resolve, reject ) => {
                let data, conexao;


                const Valida = ( callback ) =>  {
                    faturaValidacao.validaMudancaStatusAssinatura( dados )
                    .then( value => {
                        data = value;
                        callback();
                    }).catch( erro => {
                        callback(erro);
                    });
                };

                const transaction = ( callback ) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection) => {
                        if (err) return callback('erro interno');
                        conexao = connection;
                        conexao.beginTransaction( (err) => {
                            if (err) { return callback('erro interno', null);}
                            callback(null, null);
                        });
                    });
                };

                const AlteraStatusAssinatura = ( callback ) => {
                    let insert = {
                        empresa_id: data.empresa_id,
                        assinatura_id: data.assinatura_id,
                        status: data.status
                    };
                    if( data.obs_interna ) insert.obs_interna = data.obs_interna;

                    conexao.query(`INSERT INTO assinatura_status SET ?`, [ insert ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno: STS-1');
                        if( !result.insertId ) return callback('Erro interno: STS-2');
                        callback();
                    });
                };

                /**
                 * Registra os profissionais na tabela "profissional_faturar"
                 * Porque é necessário: os profissionais dessa assinatura já estão 
                 * registrados, porém quando a assinatura é cancelada, os mesmos
                 * são marcados como NÃO FATURAR, e por tanto ao ativar a assinatura
                 * novamente, deve fazer um novo registro
                 * 
                 * IMPORTANTE: registrar apenas se o status anterior da assinatura
                 * for BLOQUEADO (4) ou CANCELADO (5 ou 6)
                 */
                const ReativarProfissionaisFaturar = ( callback ) => {
                    /**
                     * FIXME:
                     * 
                     * Não esta em uso, acredito que é melhor não usar esse recurso
                     * de RETIRAR e RECOLOCAR os profissionais nas faturas
                     * 
                     * A razão é simples, se o atraso (bloqueio) for de uma assinatura
                     * for por um período curto, a próxima fatura deve ser cobrada "cheia"
                     * e não proporcioal ao período ativo
                     * 
                     * Outra situação: a fatura pode ficar inativa por muitos tempo (meses)
                     * Neste caso será também é possível saber os períodos que devem ser
                     * geradas faturas
                     * 
                     * Em outras situações, analisa-se manualmente
                     */

                    /* comentado para não correr o risco de execultar esta rotina
                    if( !( data.statusAnterior == '4' || data.statusAnterior == '5' || data.statusAnterior == '6' ) ) {
                        return callback();
                    }

                    // Cadastra os profissionais na tabela "profissional_faturar"
                    let sqlProfFaturar = 'INSERT INTO profissional_faturar (empresa_id, assinatura_id, profissional_id)';
                    if( data.profissional == 'todos' ) {
                        // reativa todos os profissionais da empresa
                        conexao.query(`${sqlProfFaturar} (SELECT p.empresa_id, ? AS assinatura_id, p.id FROM profissional p WHERE p.empresa_id = ?)`, 
                        [ data.assinatura_id, data.empresa_id ], ( erro, result ) => {
                            if( erro || !result ) return callback('Erro interno: IPF-A1');
                            if( !result.insertId ) return callback('Erro interno: IPF-A2');
                            callback();
                        });
                    } else {
                        // reativa apenas os profissionais selecionados
                        conexao.query(`${sqlProfFaturar} ( SELECT p.empresa_id, p.assinatura_id, p.profissional_id FROM assinatura_config_has_profissional p WHERE p.assinatura_id = ? AND p.assinatura_config_id = ?)`, [ data.assinatura_id, data.config_id ], ( erro, result ) => {
                            if( erro || !result ) return callback('Erro interno: IPF-B1');
                            if( !result.insertId ) return callback('Erro interno: IPF-B2');
                            callback();
                        });
                    }
                    */
                };

                const NotificaCliente = ( ) => {
                    evento.emit('assinatura.statusAlterado', data.empresa_id, data.assinatura_id, data.status );
                    if( data.enviaEmailAoCliente != true ) { return; }

                    // ENVIA E-MAIL AO CLIENTE
                    // verifica qual mensagem deve ser enviado
                    let emailParaEnvio = null;
                    
                    switch ( data.status ) {
                        case "1":
                        case "2":
                        case "3":
                            emailParaEnvio = 'assinaturaDesbloqueada';// assinatura-desbloqueada
                            break;
                        case "4":
                            emailParaEnvio = 'assinaturaBloqueada';// assinatura-bloqueada
                            break;
                        case "5":
                            emailParaEnvio = 'assinaturaCancelada99';// assinatura-cancelada99
                            break;
                          case "6":
                            emailParaEnvio = 'assinaturaCancelada';// assinatura-cancelada
                            break;
                    }

                    if( !emailParaEnvio ) { return; }

                    let hoje = moment().format('DD/MM/YYYY');
                    let assinaturaData = moment( data.dt_cadastro ).format('DD/MM/YYYY');
                    let assinaturaVencimento = moment( data.dt_cadastro ).format('DD');

                    if( emailParaEnvio == 'assinaturaDesbloqueada' ) {
                        // se o status da assinatura foi alterado de/para: iniciado(1), ativo(2) ou em atraso(3) não deve ser enviado qualquer e-mail, pois
                        // a mesma continua ativa
                        if( data.statusAnterior == "1" || data.statusAnterior == "2" || data.statusAnterior == "3" ) {
                            return;
                        }

                        /**
                         * quando a assinatura sai de "cancelada" para iniciado(1), ativo(2) ou em atraso(3)
                         * ou seja, quando uma conta saiu do plano básico para o PRÓ, deve enviar uma mensagem 
                         * informando essa condição
                         */
                        if( data.statusAnterior == "5" || data.statusAnterior == "6" ) { // assinaturaReativada    
                            // pega a data do cancelamento                      
                            mysql.query(`SELECT * FROM assinatura_status WHERE assinatura_id = ? AND status IN ('5','6') ORDER BY id DESC LIMIT 1`, [ data.assinatura_id ], (err, res) => {
                                if( err || !res ) return;
                                let cancelamentoData = moment( res[0].data ).format('DD/MM/YYYY');
                                EnviaEmailEmpresa.assinaturaReativada( data.email, data.nome, assinaturaData, cancelamentoData, hoje, assinaturaVencimento, data.tipo_pg );
                            });

                            return;
                        }

                        EnviaEmailEmpresa.assinaturaDesbloqueada( data.email, data.nome );
                        return;
                    }

                    if( data.status == '4') { // conta bloqueada
                        EnviaEmailEmpresa.assinaturaBloqueada( data.email, data.nome );
                        return;
                    }

                    if( data.status == '5') {
                        EnviaEmailEmpresa.assinaturaCancelada99( data.email, data.nome, assinaturaData, hoje );
                        return;
                    }
                };

                // Processa
                async.series([
                    Valida, 
                    transaction,
                    AlteraStatusAssinatura,
                    // ReativarProfissionaisFaturar// NÃO ESA EM USO
                ], 
                ( erro, result ) => {
                    if(erro) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(erro);
                    }
                    conexao.commit( (err) => {
                        if(err) {
                            conexao.rollback( () => conexao.release() );
                            return reject('Erro interno');
                        }
                        conexao.release();
                        resolve();

                        NotificaCliente();
                        assinaturaUtil.limpaCacheAssinatura( data.empresa_id );
                    });
                });

            });
        }


        /**
         * Registra uma observação interna sobre a assinatura
         * 
         * @param {int} empresaID PK da empresa
         * @param {int} assinaturaID PK da assinatura, deve ser a assinatura vigente
         * @param {string|null} obs observação
         */
        editObservacaoAssinatura( empresaID, assinaturaID, obs ) {
            return new Promise( ( resolve, reject ) => {
                if( !_.isString( obs )) obs = null;
                if( !obs ) obs = null;

                mysql.query(`UPDATE assinatura SET obs_interna = ? WHERE empresa_id = ? AND id = ?`, [ obs, empresaID, assinaturaID ], (err, result ) => {
                    if( err || !result ) return reject('erro interno ao atualizar dados');
                    if( result.affectedRows == 0 ) return reject('Não foi possível atualizar os dados');
                    resolve();
                });
            });
        }

    } // fim classe

    module.exports = new AdminAssinatura();
}