/* jshint -W030 */
{ 
    "use strict";

    const validacao = require('./prontuario-validacao'),
        mysql = require('src/util/conexoes.js'),
        _ = require('underscore'),
        evento = require('src/eventos/eventosInternos'),
        async = require('async');

    class Prontuario {
        constructor( empresaID, usuario ) {
            this.empresaID = empresaID;
            this.user = usuario; // profissional ID
        }

        /*
        * DICA: olhar para prontuario-validacao.js/planoAssinatura e verificar se a
        * solução encontrada lá é melhor que esta para retornar prontuário e seus campos
        */
        getProntuariosAsync( socket ) {
            mysql.query(`SELECT id, nome, ordem, ativo FROM prontuario WHERE empresa_id = ? AND usuario_id = ? AND (excluido IS NULL OR excluido='n') ORDER BY ordem ASC`, [this.empresaID, this.user.id], (err, result)=> {
                if(err || result.length == 0) return;

                async.eachSeries(result, (prontuario, callback)=> {
                    // dessa forma, pega todas as versões
                    // mysql.query(`SELECT id, nome, tipo, ordem, conf FROM prontuario_item WHERE prontuario_id = ? ORDER BY ordem ASC`, [prontuario.id], (er, re) => {
                    // dessa forma, pega apenas a versão mais recente do campo
                    mysql.query(`SELECT t1.id, t1.nome, t1.tipo, t1.ordem, t1.conf, t1.modelo 
                        FROM prontuario_item t1
                        LEFT JOIN prontuario_item AS t2 ON (t1.id = t2.id AND t1.versao < t2.versao)
                        WHERE t1.prontuario_id = ? AND t2.id IS NULL AND (t1.excluido IS NULL OR t1.excluido='n')
                        ORDER BY t1.ordem ASC`, 
                    [prontuario.id], (er, re) => {
                        if( !err && re ) {
                            re.forEach(c => {
                                if( c.conf ) c.conf = JSON.parse( c.conf );
                                else delete c.conf;

                                if( c.modelo ) c.modelo = JSON.parse( c.modelo );
                                else delete c.modelo;
                            });
                            prontuario.campos = re;
                        }
                        else prontuario.campos = [];
                        socket.emit('prontuario.getProntuarios', prontuario);
                        callback();
                    });
                }, ()=> { // fim o loop
                });
            });
        }

        /**
         * Retorna um prontuário específico e seus campos
         * 
         * @param {int} prontuarioID PK do prontuário
         */
        getProntuario( prontuarioID ) {
            return new Promise( ( resolve, reject ) => {
                mysql.query(`SELECT id, nome, ordem, ativo FROM prontuario WHERE empresa_id = ? AND usuario_id = ? AND id = ? AND (excluido IS NULL OR excluido='n')`, [this.empresaID, this.user.id, prontuarioID], (err, prontuario)=> {
                    if(err || prontuario.length == 0) return reject();
                    prontuario = prontuario[0];
                    
                    mysql.query(`SELECT t1.id, t1.nome, t1.tipo, t1.ordem, t1.conf, t1.modelo  
                        FROM prontuario_item t1
                        LEFT JOIN prontuario_item AS t2 ON (t1.id = t2.id AND t1.versao < t2.versao)
                        WHERE t1.prontuario_id = ? AND t2.id IS NULL AND (t1.excluido IS NULL OR t1.excluido='n')
                        ORDER BY t1.ordem ASC`, 
                    [prontuarioID], (er, campos) => {
                        if( er || !campos) {
                            prontuario.campos = [];
                            return resolve( prontuario );
                        }
                        campos.forEach(c => {
                            if( c.conf ) c.conf = JSON.parse( c.conf );
                            else delete c.conf;

                            if( c.modelo ) c.modelo = JSON.parse( c.modelo );
                            else delete c.modelo;
                        });
                        prontuario.campos = campos;
                        resolve(prontuario);
                    });
                });
            });
        }

        /**
         * Retorna todos os campos (atuais), apenas os ativos, de um determinado
         * prontuário
         */
        getCamposProntuario( prontuarioID ) {
            return new Promise( ( resolve, reject ) => {
                mysql.query(`SELECT t1.id, t1.nome, t1.tipo, t1.ordem, t1.conf, t1.modelo 
                FROM prontuario_item t1
                LEFT JOIN prontuario_item AS t2 ON (t1.id = t2.id AND t1.versao < t2.versao)
                WHERE t1.prontuario_id = ? AND t2.id IS NULL AND (t1.excluido IS NULL OR t1.excluido='n')
                ORDER BY t1.ordem ASC`, 
                [ prontuarioID ], (err, re) => {
                    if( err || !re ) return resolve('sem campos');
                    re.forEach(c => {
                        if( c.conf ) c.conf = JSON.parse( c.conf );
                        else delete c.conf;

                        if( c.modelo ) c.modelo = JSON.parse( c.modelo );
                        else delete c.modelo;
                    });
                    resolve( re );
                });
            });
        }

        /**
         * Adiciona nova seção de prontuário
         */
        add( dados ) {
            return new Promise( ( resolve, reject) => {
                let data, conexao, secaoID;

                const validar = ( callback ) => {
                    validacao.valida( this.empresaID, this.user.id, dados).then(( _data) =>{
                        data = _data;
                        callback(null, data );
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

                const addSecao = ( callback ) => {
                    let insert = {
                        empresa_id: this.empresaID,
                        usuario_id: this.user.id,
                        profissional_id: data.profissional_id,
                        nome: data.nome,
                    };
                    if( data.ordem ) insert.ordem = data.ordem;
                    conexao.query("INSERT INTO prontuario SET ?", [insert], (err, result) => {
                        if(err || result.length === 0) return callback('Erro interno ao salvar dados');
                        secaoID = result.insertId;
                        callback(err, result.insertId);
                    });
                };

                const Campos = (callback)=> {
                    if(_.isEmpty(data.campos)) return callback(null, null);
                    let insertCampos = [];
                    let conf, modelo, nome;
                    async.each(data.campos, (campo, callbackEach)=> {
                        conf = campo.conf ? JSON.stringify( campo.conf ) : null;
                        modelo = campo.modelo ? JSON.stringify( campo.modelo ) : null;
                        nome = _.isEmpty( campo.nome ) ? null : campo.nome;

                        insertCampos.push([this.empresaID, this.user.id, secaoID, data.profissional_id, nome, campo.tipo, campo.ordem, conf, modelo]);
                        callbackEach();
                    }, (err)=> {
                        if(err) return callback(err, null);
                        if(_.isEmpty(insertCampos)) return callback(null, null);
                        
                        conexao.query('INSERT INTO prontuario_item (empresa_id, usuario_id, prontuario_id, profissional_id, nome, tipo, ordem, conf, modelo) VALUES ?', [insertCampos], (err, result)=> {
                            if(err || result.length == 0) return callback('Erro interno ao registrar campos do formulário');
                            callback(err, null);
                        });
                    });
                };

                async.series([
                    validar, transaction, addSecao, Campos
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
                                resolve({id: secaoID });
                                evento.emit('prontuario.add', this.empresaID, this.user, secaoID );
                            }
                        });
                    }
                });
            });
        }


        /**
         * Atualiza os dados do prontuário (seção) e seus campos
         */
        edit( dados ) {
            return new Promise( ( resolve, reject) => {
                let data, conexao, hoje = new Date();
                let idsVersao = [];
                let camposUpdate = [];
                let camposAdd = [];

                const validar = ( callback ) => {
                    validacao.valida( this.empresaID, this.user.id, dados).then((_data) =>{
                        if( !_data.id ) return callback('Seção sem identificação');
                        data = _data;
                        callback();
                    }).catch((erro)=> callback(erro) );
                };

                /**
                 * Pega o ID e a Versão de cada campo com ID presete e os coloca
                 * em um array de array, sendo o array interno composto 
                 * pelo ID e pela VERSÃO, exatamente nessa ordem
                 */
                const separaIdsEVersoesDosCampos = ( callback ) => {
                    if(_.isEmpty(data.campos)) return callback();
                    for (const c of data.campos) {
                        if( !c.id ) continue;
                        idsVersao.push([c.id, c.versao]);
                    }
                    callback();
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

                const updateSecao = ( callback ) => {
                    let update = {
                        nome: data.nome,
                        dt_update: hoje
                    };
                    conexao.query("UPDATE prontuario SET ? WHERE id = ? AND empresa_id = ? AND usuario_id = ? AND profissional_id = ?", 
                    [update, data.id, this.empresaID, this.user.id, data.profissional_id], (err, res) => {
                        if(err || res.length === 0) return callback('Erro interno ao atualizar dados');
                        callback(err);
                    });
                };

                /**
                 * Exclui (ou marca como excluído) os campos que existiam antes
                 * e não foi enviado
                 */
                const CamposExcluir = ( callback ) => {
                    let idsNaoRemover = [];
                    if( camposAdd.length > 0 ) {
                        let idx;
                        for (const v of idsVersao) {
                            idx = camposAdd.findIndex( c => c.id == v[0] && c.versao == v[1] );
                            if( idx > -1 ) continue;
                            idsNaoRemover.push( v );
                        }
                    } else {
                        idsNaoRemover = idsVersao;
                    }

                    // monta os critérios e dados de consulta
                    let where = `i.empresa_id = ? AND i.prontuario_id = ? AND (i.excluido IS NULL OR i.excluido = 'n')`;
                    // let where = `i.empresa_id = ? AND i.prontuario_id = ?`;
                    let whereOp = [this.empresaID, data.id];
                    if(!_.isEmpty(idsNaoRemover)) {
                        where += ' AND (i.id, i.versao) NOT IN(?)';
                        whereOp.push(idsNaoRemover);
                    }

                    conexao.query(`SELECT i.id, i.versao, a.prontuario_item_versao AS usado
                        FROM prontuario_item i
                        LEFT JOIN atendimento_has_prontuario_item a ON (a.prontuario_item_id = i.id AND a.prontuario_item_versao = i.versao )
                        WHERE ${where}
                        ORDER BY versao DESC`, 
                    whereOp, ( err, res ) => {
                        if( err || !res ) return callback('Erro interno ao remover campos');
                        if( res.length === 0 ) return callback();
                        /*
                        * SE 'usado' tiver presente, é para marcar como excluído
                        * SE 'usado' não tiver presente, excluir definitivamente
                        */
                        //let unico = _.uniq( res, 'id', true);// TODO: não funciona adequadamente
                        let unico = res;

                        let excluir = unico.reduce( (acc, cur ) => {
                            if( cur.usado === null ) acc.push( [cur.id, cur.versao] );
                            return acc;
                        }, []);

                        let marcar = unico.reduce( (acc, cur ) => {
                            if( cur.usado !== null ) acc.push( [cur.id, cur.versao] );
                            return acc;
                        }, []);

                        async.parallel({
                            exclui: ( callbackI ) => {
                                if( !excluir || _.isEmpty( excluir ) ) return callbackI();
                                conexao.query(`DELETE FROM prontuario_item WHERE empresa_id = ? AND prontuario_id = ? AND (id, versao) IN (?)`,
                                [ this.empresaID, data.id, excluir ], (err, res ) => {
                                    if( err ) return callbackI('Erro interno ao remover campos não utilizados');
                                    callbackI();
                                });
                            },
                            marcaComoExcluido: ( callbackI ) => {
                                if( !marcar || _.isEmpty( marcar ) ) return callbackI();
                                
                                conexao.query(`UPDATE prontuario_item SET excluido = 's', modelo = null WHERE empresa_id = ? AND prontuario_id = ? AND (id, versao) IN (?)`, 
                                [ this.empresaID, data.id, marcar ], (err, res ) => {
                                    if( err ) return callbackI('Erro interno ao remover campos não utilizados 2');
                                    callbackI();
                                });
                            }
                        }, (err) => {
                            callback(err);
                        });
                    });
                };

                /**
                 * Verifica quais campos devem ser atualizados e quais devem ser
                 * criados uma nova versão
                 * 
                 * CRIAR NOVA VERSÃO SE:
                 *   - existir registro com ID e VERSAO na tabela 'atendimento_has_prontuario_item'
                 * caso contrário, atualizar a versão atual
                 * 
                 * A finalidade dessa função é separar os campos em grupos
                 * Outra função irá atualizar e outra inseri os novos dados
                 */
                const CamposX = ( callback ) => {
                    if(_.isEmpty(idsVersao)) return callback();
                    conexao.query(`SELECT i.id, i.versao, a.prontuario_item_versao AS usado
                        FROM prontuario_item i
                        LEFT JOIN atendimento_has_prontuario_item a ON (a.prontuario_item_id = i.id AND a.prontuario_item_versao = i.versao )
                        WHERE i.empresa_id = ? AND (i.id, i.versao) IN (?)
                        ORDER BY versao DESC`, 
                    [this.empresaID, idsVersao], ( err, res ) => {
                        if( err || !res ) return callback('Erro interno ao atualizar campos do formulário');
                        if( res.length == 0 ) {
                            camposUpdate = data.campos.filter( c => c.id  );
                            return callback();
                        }                      

                        let t1 =  res.filter( r => r.usado !== null ).map( r => r.id );
                        camposAdd = data.campos.filter( c => c.id && t1.includes( c.id ));

                        let t2 =  res.filter( r => r.usado === null ).map( r => r.id );
                        camposUpdate = data.campos.filter( c => c.id && t2.includes( c.id ));

                        callback();
                    });
                };

                /**
                 * Insere campos novos
                 */
                const CamposAdd = (callback)=> {
                    if(_.isEmpty(data.campos)) return callback();
                    let insertCampos = [];
                    let conf, modelo, nome;
                    let camposNovos = data.campos.filter( c => !c.id );
                    async.each(camposNovos, (campo, callbackEach)=> {
                        conf = campo.conf ? JSON.stringify( campo.conf ) : null;
                        modelo = campo.modelo ? JSON.stringify( campo.modelo ) : null;
                        nome = _.isEmpty( campo.nome ) ? null : campo.nome;

                        insertCampos.push([this.empresaID, this.user.id, data.id, data.profissional_id, nome, campo.tipo, campo.ordem, conf, modelo]);
                        callbackEach();
                    }, (err) => {
                        if(err) return callback(err);
                        if(_.isEmpty(insertCampos)) return callback();
                        
                        conexao.query('INSERT INTO prontuario_item (empresa_id, usuario_id, prontuario_id, profissional_id, nome, tipo, ordem, conf, modelo) VALUES ?', 
                        [insertCampos], (err, res)=> {
                            if( err || !res ) return callback('Erro interno ao registrar campos do formulário');
                            if( !res.affectedRows ) return callback('Erro interno ao registrar campos do formulário');

                            callback(err);
                        });
                    });
                };

                const CamposAddVersao = (callback)=> {
                    if(_.isEmpty(camposAdd)) return callback();
                    let insertCampos = [];
                    let conf, modelo, nome;
                    
                    async.each(camposAdd, (campo, callbackEach)=> {
                        conf = campo.conf ? JSON.stringify( campo.conf ) : null;
                        modelo = campo.modelo ? JSON.stringify( campo.modelo ) : null;
                        nome = _.isEmpty( campo.nome ) ? null : campo.nome;

                        insertCampos.push([this.empresaID, this.user.id, data.id, data.profissional_id, campo.id, campo.versao+1, nome, campo.tipo, campo.ordem, conf, modelo]);
                        callbackEach();
                    }, (err)=> {
                        if(err) return callback(err);
                        if(_.isEmpty(insertCampos)) return callback();
                        
                        conexao.query('INSERT INTO prontuario_item (empresa_id, usuario_id, prontuario_id, profissional_id, id, versao, nome, tipo, ordem, conf, modelo) VALUES ?', 
                        [insertCampos], (err, res)=> {
                            if(err || !res) return callback('Erro interno ao registrar campos do formulário');
                            if( !res.affectedRows ) return callback('Erro interno ao registrar campos do formulário');
                            callback();
                        });
                    });
                };

                /**
                 * Pega os campos que foram enviados e que tem ID e os atualiza
                 */
                const CamposAtualizacao = ( callback ) => {
                    if(_.isEmpty(camposUpdate)) return callback();
                    let updateCampos;
                    let conf, modelo;
                    
                    async.each(camposUpdate, (campo, callbackEach)=> {
                        conf = campo.conf ? JSON.stringify( campo.conf ) : null;
                        modelo = campo.modelo ? JSON.stringify( campo.modelo ) : null;

                        updateCampos = {
                            nome: campo.nome || null,
                            tipo: campo.tipo,
                            ordem: campo.ordem,
                            conf: conf,
                            modelo: modelo,
                            dt_update: hoje
                        };
                        if( _.isEmpty( campo.nome ) ) updateCampos.nome = null;

                        conexao.query(`UPDATE prontuario_item SET ?, versao=versao+1 
                            WHERE empresa_id = ? AND usuario_id = ? AND profissional_id = ? 
                            AND prontuario_id = ? AND (id, versao) IN (?)`, 
                        [updateCampos, this.empresaID, this.user.id, data.profissional_id, data.id, [[campo.id, campo.versao]]], (err, res)=> {
                            if( err || !res ) return callbackEach('Erro interno ao atualizar campos do formulário');
                            if( !res.affectedRows ) return callbackEach('Erro interno ao atualizar campos do formulário');
                            callbackEach();
                        });
                    }, (err)=> {
                        callback(err);
                    });
                };

                async.series([
                    validar, 
                    separaIdsEVersoesDosCampos, 
                    transaction, 
                    updateSecao, 
                    CamposX, 
                    CamposExcluir, 
                    CamposAdd, 
                    CamposAtualizacao, 
                    CamposAddVersao
                ], (err) => {
                    if(err) {
                        // a conexão pode não existir, pois pode não ser executada a função 'transaction'
                        if( conexao ) conexao.rollback(() => conexao.release() );
                        return reject(err);
                    }

                    conexao.commit((err)=> {
                        if(err) {
                            conexao.rollback(()=> conexao.release() );
                            reject('Erro interno no commit');
                        }else {
                            conexao.release();
                            resolve();
                            evento.emit('prontuario.edit', this.empresaID, this.user.id, data.id, data.nome);// TODO: CHECAR porque isso está comentado
                        }
                    });
                });
            });
        } // edit

        /**
         * Remove OU marca como removido um registro na tabela 'prontuário' (seção do prontuàrio)
         * @param {int} secaoID PK na tabela 'prontuario'
         */
        del( secaoID ) {
            return new Promise( ( resolve, reject ) => {
                let acao = ''; // REMOVER | MARCAR

                const Valida = ( callback ) => {
                    validacao.validaGenerico( this.empresaID, this.user.id, secaoID )
                    .then( () => callback() )
                    .catch( (erro) => callback(erro));
                };

                // verifica o que deve ser feito, se é REMOVER definitivamente, OU
                // se é para MARCAR como removido apenas
                const RemoverOuMarcar = ( callback ) => {
                    mysql.query(`SELECT count(*) AS total FROM atendimento_has_prontuario_item WHERE empresa_id = ? AND prontuario_item_prontuario_id = ?`, [this.empresaID, secaoID],
                    (erro, res ) => {
                        if( erro || !res) return callback('erro interno');
                        acao = res[0].total > 0 ? 'MARCAR' : 'REMOVER';
                        callback();
                    });
                };

                const Remove = ( callback ) => {
                    if( acao !== 'REMOVER') return callback();

                    mysql.query("DELETE FROM prontuario WHERE empresa_id = ? AND id = ?", [this.empresaID, secaoID], (err, res ) => {
                        if( err || !res ) return callback('Erro ao remover seção');
                        callback();
                    });
                };

                const MarcaComoExcluido = ( callback ) => {
                    if( acao !== 'MARCAR') return callback();

                    mysql.query("UPDATE prontuario SET excluido='s' WHERE empresa_id = ? AND id = ? LIMIT 1", [this.empresaID, secaoID], (err, res ) => {
                        if( err || !res ) return callback('Erro ao remover seção');
                        callback();
                    });
                };

                async.series([ Valida, RemoverOuMarcar, Remove, MarcaComoExcluido ], 
                (err, result)=> {
                    if (err) return reject(err);
                    resolve();

                    evento.emit('prontuario.del', this.empresaID, this.user.id, secaoID);
                });
            });
        }

        /**
         * Ativa ou Inativa uma seção do prontuário
         * 
         * @param {int} secaoID PK tabela prontuario
         * @param {String} status 's' = ativo, 'n' = inativo, corresponde ao campo 'ativo' da tabela prontuario
         */
        ativaInativa ( secaoID, status) {
            return new Promise( (resolve, reject) => {
                if( status !== 's' && status !== 'n') return reject('Status inválido');
                
                validacao.validaGenerico( this.empresaID, this.user.id, secaoID )
                .then( (profissionalID) => {
                    mysql.query('UPDATE prontuario SET ativo = ? WHERE empresa_id = ? AND id = ? LIMIT 1', [status, this.empresaID, secaoID], (err, res) => {
                        if( err || !res ) return reject('Erro interno, não foi possível alterar o status');
                        resolve();
                        evento.emit('prontuario.ativaInativa', this.empresaID, this.user.id, secaoID, status);
                    });
                }).catch( (erro) => reject(erro));                
            });
        }


        /**
         * Altera a posição das seções (prontuários)
         * @param {Array} prontuariosID PKs dos prontuários. A posição do ID 
         * no array deve ser a posição na tabela
         */
        ordenar ( prontuariosID ) {
            return new Promise( (resolve, reject) => {
                let profissionalID, conexao;

                const validar = ( callback ) => {
                    validacao.validaGenerico( this.empresaID, this.user.id, prontuariosID ).then( (_profissionalID) => {
                        profissionalID = _profissionalID;
                        callback();
                    }).catch( (erro) => callback(erro));
                };

                const transaction = ( callback ) => {
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

                const db = ( callback ) => {
                    let i = 0;
                    async.each(prontuariosID, (id, callbackEach)=> {
                        i++;

                        conexao.query(`UPDATE prontuario set ordem = ? WHERE id = ? 
                        AND empresa_id = ? AND usuario_id = ? AND profissional_id = ?`, 
                        [i, id, this.empresaID, this.user.id, profissionalID],(err, res) => {
                            if( err || !res ) return callbackEach('Erro interno ao atualizar posições');
                            callbackEach();
                        });
                        
                    }, (err)=> {
                        callback(err);
                    });
                };

                async.series([
                    validar, transaction, db
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
                                evento.emit('prontuario.ordenaProntuarios', this.empresaID, this.user.id, prontuariosID );
                            }
                        });
                    }
                });

            });
        }


        /**
         * Atualiza o(s) modelo(s) de um campo de texto longo
         * 
         * @param {Integer} prontuarioID PK da seção de prontuário
         * @param {Integer} campoID PK do campo
         * @param {Array|null} modelos o(s) modelo(s) do campo. Null se for para remover
         */
        salvaModelosDeCampo ( prontuarioID, campoID, modelos ) {
            return new Promise( (resolve, reject) => {
                validacao.validaModeloCampo( this.empresaID, this.user.id, prontuarioID, campoID, modelos )
                .then( (data) => {
                    modelos = data.modelos ? JSON.stringify( data.modelos ) : null;
                    mysql.query('UPDATE prontuario_item SET modelo = ? WHERE empresa_id = ? AND id = ? AND versao = ? AND profissional_id = ? LIMIT 1', [modelos, this.empresaID, campoID, data.campoVersao, data.profissionalID], (err, res) => {
                        if( err || !res ) return reject('Erro interno ao registrar dados');
                        if( !res.affectedRows ) return reject('Erro interno ao registrar dados');
                        resolve();
                        evento.emit('prontuario.modeloDeCampoAtualizado', this.empresaID, this.user.id, prontuarioID, campoID, data.modelos );
                    });
                }).catch( (erro) => reject(erro) );
            });
        }

        
    } // fim classe

    module.exports = Prontuario;
}