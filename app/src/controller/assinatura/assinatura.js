/* jshint -W030 */
{ 
    "use strict";

    /**
     * Referente a assinatura de planos do 99clinic
     */

    const 
        mysql = require('src/util/conexoes.js'),
        validacao = require('src/controller/assinatura/assinatura-validacao.js'),
        evento = require('src/eventos/eventosInternos'),
        EnviaEmail = require("src/controller/enviaEmail.js").EnviaEmail,
        EnviaEmailEmpresa = require("src/admin/enviaEmail.js").EnviaEmail,
        moment = require('moment'),
        _ = require('underscore'),
        async = require('async'),
        redis = mysql.redis(),
        log = require('src/util/logInterno');

    class Assinatura {
        constructor( usuario ) {
            this.empresaID = usuario.empresa_id;
            this.usuario = usuario; // usuário logado, do aperto de mão
        }

        /**
         * Verifica qual é o plano atualmente ativo para o cliente, se é o plano
         * Pró ou Grátis. Se for o pró, retornar o status (liberado ou bloqueado)
         * 
         * Tem a finalidade de indicar para o aplicação cliente qual os recursos
         * devem estar liberados. Ou seja, apenas indica qual o plano vigente, não
         * os dados em sí, e deve retornar para todos os usuários, administradores,
         * secretárias e profissionais
         * 
         * Não buscar os status 5 e 6, pois esses status são como se a assinatura
         * não existisse
         * 
         * 
         */
        situacaoAssinatura () {
            return new Promise( ( resolve, reject ) => {
                mysql.query(`SELECT id, status, profissional, config_id FROM v_assinatura WHERE empresa_id = ? ORDER BY id DESC LIMIT 1`, [ this.empresaID ], (err, result) => {
                    if( err || !result ) return reject('erro interno do servidor');
                    if( result.length == 0 ) return resolve({plano: 'gratis'});
                    if( result[0].status == '5' || result[0].status == '6' ) return resolve({plano: 'gratis'});

                    let dados = {plano: 'pró', status: result[0].status, id: result[0].id, profissional: result[0].profissional };
                    if( result[0].profissional == 'todos' ) return resolve( dados );

                    // se for profissionais selecionados, busca esses profissionais
                    mysql.query(`SELECT profissional_id, usuario_id FROM assinatura_config_has_profissional WHERE empresa_id = ? AND assinatura_config_id = ?`, [ this.empresaID, result[0].config_id ], (err, result ) => {
                        if( err || !result ) return reject('erro interno do servidor');
                        dados.profissionais = result.map(f => f.profissional_id);
                        resolve( dados );
                    });
                });
            });
        }

        /**
         * Retorna a assinatura vigente
         * Apenas para administradores
         */
        getAssinatura ( ) {
            return new Promise( ( resolve, reject ) => {
                if( this.usuario.perfil != 'a' ) { return reject('sem permissão'); }

                // FIXME: não retornar a observação interna
                mysql.query(`SELECT a.*,
                 (SELECT count(*) FROM profissional_faturar WHERE assinatura_id = a.id AND dt_saida IS NULL ) AS total_profissionais
                 FROM v_assinatura a
                 WHERE a.empresa_id = ? ORDER BY a.id DESC LIMIT 1`, [this.empresaID], (err, result) => {
                    if( err || !result ) return reject('erro interno do servidor');
                    if( result.length == 0 ) return resolve( null );
                    if( result[0].status == '5' || result[0].status == '6' ) return resolve( null );
                    resolve( result[0] );
                });
            });
        }// getAssinatura


        /**
         * Retorna as últimas faturas, porém, não deixa de retornar nenhuma fatura
         * pendente de pagamento
         * 
         * FIXME: retornar apenas as ultimas 12 faturas. Se houver faturas mais
         * antiga que isso e não tiver sido paga, retornar
         * 
         * FIXME: Retornar também informação sobre os pagametos e o demonstrativo
         * FIXME: Retornar o demonstrativo da fatura, lista do que esta sendo cobrado
         */
        getFaturas () {
            return new Promise( ( resolve, reject ) => {
                if( this.usuario.perfil != 'a' ) { return reject('sem permissão'); }
                mysql.query(`SELECT id, assinatura_id, dt_inicio, dt_fim, dt_gerado, dt_vencimento, valor, valor_recebido, custo_cobranca, link_pg, status 
                FROM v_fatura WHERE empresa_id = ? AND status !='ca' ORDER BY id DESC`, 
                [ this.empresaID ], (erro, result) => {
                    if( erro || !result ) return reject( 'Erro interno ao baixar faturas' ); 
                    resolve( result );
                });
                // AND !( status = 'pt' AND dt_vencimento > SUBDATE(NOW(), INTERVAL 12 MONTH) ) 
            });
        }// getFaturas


        /**
         * Realiza a assinatura do plano PRÓ
         * REGRAS:
         * - Permitido apenas para administradores
         * - Só é permitido uma assinatura vigente por vez
         * - Não pode criar nova assinatura se houver pendência financeira (de assinaturas anteriores)
         */
        assinar ( dados ) {
            return new Promise( ( resolve, reject ) => {
                let data, conexao, assinaturaID, configID, statusID, enderecoID;

                const valida = ( callback ) => {
                    validacao.validaAssinatura( this.empresaID, this.usuario, dados )
                    .then( ( _data ) => {
                        data = _data;
                        callback();
                    }).catch( erro => {
                        let _err = geraMsgErro( erro, 'valida', `Dados incorretos (não passou na validação) - EmpresaID: ${this.empresaID}\n ${JSON.stringify( erro )}` );
                        callback( _err );
                    });
                };

                /**
                 * Retorna um objeto de erro pronto para ser passado ao callback
                 * Essa mensagem de erro tem uma versão para o cliente e outra para uso interno
                 * que será enviada por e-mail e também registrada no banco de dados
                 * 
                 * @param {String} msgCliente mensagem de erro apresentada ao cliente
                 * @param {String} funcao qual função/método gerou o erro
                 * @param {String|Object} erroInterno erro interno. Se for um Object, é um erro SQL
                 */
                const geraMsgErro = ( msgCliente, funcao, erroInterno ) => {
                    let _err = {
                        cliente: msgCliente,
                        interno: {
                            funcao: funcao,
                            msg: erroInterno
                        }
                    }
                    if( _.isObject( erroInterno )  ) {
                        _err.interno.msg = `Erro no INSERT.\nCódigo SQL: ${erroInterno.code}\nSQL Mensagem: ${erroInterno.sqlMessage}\nQUERY: ${erroInterno.sql}`;
                    }
                    return _err;
                };

                const transaction = ( callback ) => {
                    let pool = mysql.pool;
                    pool.getConnection( (err, connection) => {
                        if (err) return callback({
                                cliente: 'Erro interno',
                                interno: {
                                    funcao: 'getConnection',
                                    msg: 'Erro ao criar pool de conexão'
                                }
                            });
                        conexao = connection;
                        conexao.beginTransaction( (err) => {
                            if (err) { 
                                return callback({
                                    cliente: 'Erro interno',
                                    interno: {
                                        funcao: 'beginTransaction',
                                        msg: 'Erro ao criar pool de conexão'
                                    }
                                });
                            }
                            callback();
                        });
                    });
                };

                const registraAssinatura = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.usuario.id
                    };
                    conexao.query(`INSERT INTO assinatura SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraStatus', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraStatus', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        assinaturaID = result.insertId;
                        callback();
                    });
                };

                const registraStatus = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.usuario.id,
                        assinatura_id: assinaturaID,
                        status: '1'
                    };
                    
                    conexao.query(`INSERT INTO assinatura_status SET ? `, [insert], ( erro, result ) => {                      
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraStatus', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraStatus', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        statusID = result.insertId;
                        callback();
                    });
                };

                const registraEndereco = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.usuario.id,
                        assinatura_id: assinaturaID
                    };
                    Object.assign( insert, data.endereco );
                    conexao.query(`INSERT INTO assinatura_endereco SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar endereço', 'registraEndereco', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar endereço', 'registraEndereco', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        enderecoID = result.insertId;
                        callback();
                    });
                };

                // chamado por: registraConfiguracao
                const registraProfissionais = ( configID, callback ) => {
                    if( data.profissional == 'todos' ) return callback(); // não é necessário registrar os profissionais, pois será cobrado de todos
                    let dados = data.profissionais.map( p => [this.empresaID, assinaturaID, configID, p[0], p[1]]); // transforma uma matriz de ids em uma matriz de matriz

                    conexao.query(`INSERT INTO assinatura_config_has_profissional (	empresa_id, assinatura_id, assinatura_config_id, profissional_id, usuario_id) VALUES ?`, [dados], (erro, result) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar profissionais', 'registraProfissionais', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar profissionais', 'registraProfissionais', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        callback();
                    });
                };

                /**
                 * Registra os IDs dos profissionais que serão faturados
                 */
                const registraProfissionaisFaturar = ( callback ) => {
                    let dados = data.profissionais.map( p => [this.empresaID, assinaturaID, p[0] ]);

                    conexao.query(`INSERT INTO profissional_faturar ( empresa_id, assinatura_id, profissional_id ) VALUES ?`, [dados], (erro, result) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar profissionais 2', 'registraProfissionaisFaturar', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar profissionais 2', 'registraProfissionaisFaturar', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        callback();
                    });
                };

                const registraConfiguracao = ( callback ) => {
                    let insert = Object.assign( {}, data, {empresa_id: this.empresaID, usuario_id: this.usuario.id, assinatura_id: assinaturaID } );
                    insert = _.omit( insert, [ 'endereco', 'profissionais' ] );
                    
                    conexao.query(`INSERT INTO assinatura_config SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraConfiguracao', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar dados', 'registraConfiguracao', 'O INSERT não funcionou' );
                            return callback( _err );
                        }
                        configID = result.insertId;

                        registraProfissionais( result.insertId, callback );
                    });
                };

                const processaEmParalelo = ( callback ) => {
                    async.parallel([
                        registraStatus,
                        registraEndereco,
                        registraConfiguracao,
                        registraProfissionaisFaturar
                    ], (err, result) => {
                        callback( err );
                    });
                };

                /**
                 * Insere na tabela assinatura o ID do status, do endereço e da configuração
                 */
                const updateAssinatura = ( callback ) => {
                    conexao.query(`UPDATE assinatura SET config_id = ?, endereco_id = ?, status_id = ? WHERE id = ?`, [ configID, enderecoID, statusID, assinaturaID ], ( erro, result ) => {
                        if( erro || !result ) {
                            let _err = geraMsgErro( 'erro interno ao registrar assinatura', 'updateAssinatura', erro );
                            return callback( _err );
                        }
                        if( result.affectedRows == 0 ) {
                            let _err = geraMsgErro( 'erro interno ao registrar assinatura', 'updateAssinatura', 'O Update não funcionou' );
                            return callback( _err );
                        }
                        callback();
                    });
                };

                const notificacao = () => {
                    // Notificação INTERNA para o 99Clinic
                    let msg = `<strong>Empresa: </strong> ${this.empresaID} - ${data.razao_social}<br>
                    <strong>Assinatura ID: </strong> ${assinaturaID}<br>
                    <strong>Profissionais: </strong> ${data.profissional} (${data.profissionais.length})<br>
                    `;
                    EnviaEmail.AvisoInterno( 'Nova Assinatura PRÓ', msg );

                    // Mensagem para o cliente
                    let dataAssinatura = moment().format('DD/MM/YYYY');
                    let vencimento = moment().format('DD');
                    EnviaEmailEmpresa.assinaturaAssinou( data.email, data.nome, dataAssinatura, vencimento, data.tipo_pg );
                };

                /**
                 * Registra no logo interno o erro ocorrido para que possamos tomar
                 * conhecimento e então corrigir o problema
                 * 
                 * Também envia um e-mail para a equipe 99Clinic informando que houve
                 * o problema
                 * 
                 * @param {String} erro.msg mensagem explicando o erro ocorrido
                 * @param {String} erro.funcao nome da função que gerou o erro
                 */
                const registraErro = ( erro ) => {
                    let empresaNome = ( data && data.razao_social ? data.razao_social : '');
                    log.registraErro( erro.msg, 'assinatura', `Arquivo: src/controller/assinatura/assinatura.js, Função: ${erro.funcao}`);
                    
                    // Notificação INTERNA para o 99Clinic
                    let _msg = erro.msg.replace(/\n/g, '<br>');
                    let msg = `<strong>Empresa: </strong> ${this.empresaID} - ${empresaNome}<br>
                    <strong>Local do erro: </strong> Função: ${erro.funcao}<br>
                    <strong>Erro: </strong> ${_msg}
                    `;
                    EnviaEmail.AvisoInterno( 'Erro ao assinar o plano PRÓ', msg );
                };

                // inicia o processamento em série
                async.series([
                    valida,
                    transaction,
                    registraAssinatura,
                    processaEmParalelo,
                    updateAssinatura
                ], (err, result) => {
                    // aqui será feito o comit ou rollback
                    if(err) {
                        registraErro( err.interno );
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject( err.cliente );
                    }
                    conexao.commit( (err) => {
                        if(err) {
                            conexao.rollback( () => conexao.release() );
                            return reject('Erro interno');
                        }
                        conexao.release();
                        resolve(assinaturaID);

                        evento.emit('assinatura.criada', this.empresaID, assinaturaID);
                        this._limpaCacheAssinatura( this.empresaID );
                        notificacao();
                    });
                });
            });
        }// assinar

         /**
          * Altera o endereço de cobrança da assinatura vigente
          */
         alteraEnderecoCobranca( endereco ) {
            return new Promise( ( resolve, reject ) => {
                let assinaturaID, _endereco, insert;
                const valida = ( callback ) => {
                    validacao.validaEndereco( this.empresaID, this.usuario, endereco )
                    .then( ( _data ) => {
                        assinaturaID = _data.assinaturaID;
                        _endereco = _data.endereco;
                        callback();
                    }).catch( ( erro ) => {
                        callback( erro );
                    });
                };

                const alteraEndereco = ( callback ) => {
                    insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.usuario.id,
                        assinatura_id: assinaturaID
                    };
                    Object.assign( insert, _endereco );
                    if( insert.numero == '' ) delete insert.numero;
                    if( insert.complemento == '' ) insert.complemento = null;
                    
                    mysql.query(`INSERT INTO assinatura_endereco SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar endereço' );
                        if( result.affectedRows == 0 ) return callback('erro interno ao registrar endereço');
                        callback();
                    });
                };

                async.series([
                    valida,
                    alteraEndereco,
                ], (err, result) => {
                    if(err) return reject( err );
                    resolve();
                    evento.emit('assinatura.enderecoAlterado', this.empresaID, assinaturaID, insert );
                });
            });
         }// alteraEnderecoCobranca
        
         /**
          * Altera os dados assinatura:
          * - tipo_responsavel
          * - nome
          * - razao_social
          * - cpf_cnpj
          * - nascimento
          * - email
          * - fone
          * - tipo_pg
          * 
          * IMPORTANTE: o campo 'profissional' não será atualizado, por tanto é
          * necessário pegar esse campo do registro antigo e coloca-lo nesse novo
          * insert
          */
         alteraDados( dados ) {
            return new Promise( ( resolve, reject ) => {
                let 
                assinaturaID, 
                profissional, 
                ultimoConfigID, // ultimo antes da alteração
                configID, 
                _dados, 
                insert,
                conexao;

                const valida = ( callback ) => {
                    validacao.validaDados( this.empresaID, this.usuario, dados )
                    .then( ( _data ) => {
                        _dados = _data.dados;
                        assinaturaID = _data.assinaturaID;
                        profissional = _data.profissional;
                        ultimoConfigID = _data.ass_config_id;
                        callback();
                    }).catch( ( erro ) => {
                        callback( erro );
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

                const alteraDados = ( callback ) => {
                    insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.usuario.id,
                        assinatura_id: assinaturaID,
                        profissional: profissional
                    };
                    Object.assign( insert, _dados );

                    if( _dados.nome == '' ) insert.nome = null;
                    if( _dados.razao_social == '' ) insert.razao_social = null;

                    conexao.query(`INSERT INTO assinatura_config SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar dados' );
                        if( result.affectedRows == 0 ) return callback('erro interno ao registrar dados');
                        configID = result.insertId;
                        callback();
                    });
                };

                /**
                 * Atualiza o campo 'assinatura_config_id' da tabela 'assinatura_config_has_profissional'
                 * Isso garante que os profissionais que estavam na configuração anterior continue em vigor
                 * 
                 */
                const atualizaProfissionais = ( callback ) => {
                    conexao.query(`UPDATE assinatura_config_has_profissional SET assinatura_config_id = ? WHERE assinatura_config_id = ?`, [ configID, ultimoConfigID ], ( erro, result ) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar dados' );
                        if( result.affectedRows == 0 && profissional == 'selecionado' ) return callback('erro interno ao registrar dados');
                        callback();
                    });
                };

                async.series([
                    valida,
                    transaction,
                    alteraDados,
                    atualizaProfissionais
                ], (err, result) => {
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    conexao.commit( (err) => {
                        if(err) {
                            conexao.rollback( () => conexao.release() );
                            return reject('Erro interno');
                        }
                        conexao.release();
                        resolve();

                        evento.emit('assinatura.dadosAlterado', this.empresaID, assinaturaID );
                    });
                });
            });
         }// alteraDados

         // TODO: enviar e-mail ao cliente informando a mudança
         alterarProfissionais( dados ) {
            return new Promise( ( resolve, reject ) => {
                let 
                _assinatura, // assinatura antiga retiado da view "v_assinatura"
                _dados, // os novos dados (profissional e profissionais)
                configID, // novo ID da configuração
                conexao;

                const valida = ( callback ) => {
                    validacao.validaProfissionais( this.empresaID, this.usuario, dados )
                    .then( ( _data ) => {
                        _dados = _data.dados;
                        _assinatura = _data.assinaturaConfig;
                        callback();
                    }).catch( ( erro ) => {
                        callback( erro );
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

                const alteraDados = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        assinatura_id: _assinatura.id,
                        usuario_id: this.usuario.id,
                        tipo_responsavel: _assinatura.tipo_responsavel,
                        nome: _assinatura.nome,
                        razao_social: _assinatura.razao_social,
                        cpf_cnpj: _assinatura.cpf_cnpj,
                        nascimento: _assinatura.nascimento,
                        email: _assinatura.email,
                        fone: _assinatura.fone,
                        tipo_pg: _assinatura.tipo_pg,
                        profissional: _dados.profissional
                    };

                    conexao.query(`INSERT INTO assinatura_config SET ? `, [insert], ( erro, result ) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar dados' );
                        if( result.affectedRows == 0 ) return callback('erro interno ao registrar dados');
                        configID = result.insertId;
                        callback();
                    });
                };

                // chamar depois de: registraConfiguracao
                const registraProfissionais = ( callback ) => {
                    if( _dados.profissional == 'todos' ) return callback(); // não é necessário registrar os profissionais, pois será cobrado de todos
                    let prof = _dados.profissionais.map( p => [this.empresaID, _assinatura.id, configID, p[0], p[1]]); // transforma uma matriz de ids em uma matriz de matriz

                    conexao.query(`INSERT INTO assinatura_config_has_profissional (	empresa_id, assinatura_id, assinatura_config_id, profissional_id, usuario_id) VALUES ?`, [prof], (erro, result) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar profissionais' );
                        if( result.affectedRows == 0 ) return callback('erro interno ao registrar profissionais');
                        callback();
                    });
                };

                /**
                 * Verifica quais são os profissionais que foram removidos e
                 * quais foram adicionados no plano PRÓ
                 */
                let 
                prfExcluidos = [], // deixar de faturar esses profissionais
                prfNovos = []; // passar a faturar esses profissionais
                const processaProfissionais = ( callback ) => {
                    let prfEnviados = _dados.profissionais.map( p => p[0] );

                    // busca os profissionais já registrados
                    conexao.query(`SELECT profissional_id FROM profissional_faturar WHERE empresa_id = ? AND assinatura_id = ? AND dt_saida IS NULL`, [ this.empresaID, _assinatura.id ], (erro, result) => {
                        if( erro || !result ) return callback( 'erro interno' );
                        
                        // determina quais os novos profissionais no plano PRÓ
                        let x;
                        for (const p of prfEnviados) {
                            x = result.find( pf => pf.profissional_id == p );
                            if( !x ) prfNovos.push( p );
                        }

                        // determina quais os profissionais SAIU do plano pró
                        for (const p of result) {
                            x = prfEnviados.find( pf => pf == p.profissional_id );
                            if( !x ) prfExcluidos.push( p.profissional_id );
                        }

                        callback();
                    });
                };


                /**
                 * Registra os IDs dos profissionais que serão faturados e não
                 * estavam sendo faturados
                 */
                const registraProfissionaisFaturar = ( callback ) => {
                    if( !prfNovos || prfNovos.length == 0 ) return callback();
                    let faturar = prfNovos.map( p => [this.empresaID, _assinatura.id, p ]);

                    conexao.query(`INSERT INTO profissional_faturar ( empresa_id, assinatura_id, profissional_id ) VALUES ?`, [faturar], (erro, result) => {
                        if( erro || !result ) return callback( 'erro interno ao registrar profissionais' );
                        if( result.affectedRows == 0 ) return callback('erro interno ao registrar profissionais');
                        callback();
                    });
                };

                /**
                 * Registra, na tabela profissional_faturar, a data (dt_saida)
                 */
                const cancelaProfissionaisFaturar = ( callback ) => {
                    if( !prfExcluidos || prfExcluidos.length == 0 ) return callback();

                    conexao.query(`UPDATE profissional_faturar SET dt_saida = NOW(), motivo_saida = 'sem_pro' 
                    WHERE empresa_id = ? AND assinatura_id = ? AND profissional_id IN (?)`, 
                    [ this.empresaID, _assinatura.id, prfExcluidos ], (erro, result) => {
                        if( erro || !result ) return callback( 'erro interno' );
                        if( result.affectedRows == 0 ) return callback('erro interno');
                        callback();
                    });
                };


                // ===============
                const processaEmParalelo = ( callback ) => {
                    async.parallel([
                        registraProfissionais,
                        registraProfissionaisFaturar,
                        cancelaProfissionaisFaturar
                    ], (err, result) => {
                        callback( err );
                    });
                };
                // ===============

                async.series([
                    valida,
                    transaction,
                    alteraDados,
                    processaProfissionais,
                    processaEmParalelo
                ], (err, result) => {
                    if(err) {
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }
                    conexao.commit( (err) => {
                        if(err) {
                            conexao.rollback( () => conexao.release() );
                            return reject('Erro interno');
                        }
                        conexao.release();
                        resolve();

                        evento.emit('assinatura.profissionaisAlterados', this.empresaID, _assinatura.id );

                        this._limpaCacheAssinatura( this.empresaID );
                    });
                });
            });
        }// alterarProfissionais

        /**
         * Cancela a assinatura do plano PRÓ, volta para o plano GRÁTIS
         * 
         * REGRAS
         * - o plano vigente não pode esta bloqueado
         * 
         */
        cancelar( motivoCancelamento ) {
            return new Promise( ( resolve, reject ) => {
                let assinaturaID, assinanteNome, assinanteEmail, assinaturaData, novoStatus = '6';

                const _valida = ( callback ) => {
                    if ( !this.usuario || !_.isObject( this.usuario )) {
                        return callback('Acesso não autorizado');
                    }
                    if ( !this.usuario.perfil || this.usuario.perfil != 'a') {
                        return callback('Acesso não autorizado');
                    }

                    if( !_.isString( motivoCancelamento )) motivoCancelamento = null;// impede de entrar dados incorretos no DB

                    // verifica se a assinatura existe
                    mysql.query(`SELECT id, nome, email, DATE_FORMAT(dt_cadastro, "%d/%m/%Y") AS dt_cadastro FROM v_assinatura WHERE empresa_id = ? ORDER BY id DESC LIMIT 1`, [ this.empresaID ], (err, result) => {
                        if( err || !result ) return callback('erro interno do servidor');
                        if( result.length === 0 ) return callback('Assinatura não encontrada');
                        if( result[0].status == '5' || result[0].status == '6' ) {
                            return callback('A assinatura não esta ativa. Não há o que cancelar');
                        }
                        assinaturaID = result[0].id;
                        assinanteNome = result[0].nome;
                        assinanteEmail = result[0].email;
                        assinaturaData = result[0].dt_cadastro;
                        callback( );
                    });
                };

                const _cancela = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        assinatura_id: assinaturaID,
                        usuario_id: this.usuario.id,
                        status: novoStatus
                    };
                    if( motivoCancelamento ) insert.obs_interna = 'Motivo do cancelamento informado pelo cliente: \n' + motivoCancelamento;
                    mysql.query(`INSERT INTO assinatura_status SET ?`, [ insert ], ( erro, result ) => {
                        if( erro || !result ) return callback('Erro interno: STS-1');
                        if( !result.insertId ) return callback('Erro interno: STS-2');
                        callback();
                    });
                };

                async.series([
                    _valida, 
                    _cancela
                ], (erro, result ) => {
                    if( erro ) return reject( erro );
                    resolve();
                    evento.emit('assinatura.statusAlterado', this.empresaID, assinaturaID, novoStatus );

                    // Envia e-mail ao cliente
                    let hoje = moment().format('DD/MM/YYYY');
                    EnviaEmailEmpresa.assinaturaCancelada( assinanteEmail, assinanteNome, assinaturaData, hoje );


                    // Email interno
                    motivoCancelamento = motivoCancelamento ? motivoCancelamento.replace(/\n/g, "<br>") : 'Não informado';
                    let msg = `<strong>Empresa: </strong> ${this.empresaID}<br>
                    <strong>Assinatura ID: </strong> ${assinaturaID}<br>
                    <strong>Motivo do cancelamento:</strong><br>${motivoCancelamento}`;

                    EnviaEmail.AvisoInterno( 'Cancelamento plano PRÓ', msg );

                    this._limpaCacheAssinatura( this.empresaID );
                });
            });// promise
        }// cancelar


        /**
         * Remove o cache da assinatura de uma empresa
         * o correto seria usar assinatura-util.js, mas infelizmente há uma dependência
         * circular, motivo de um erro que não conseguir resolver.
         */
        _limpaCacheAssinatura( empresaID ) {
            redis.del( 'assinatura:' + empresaID );
        }
        
    } // fim classe

    module.exports = Assinatura;
}